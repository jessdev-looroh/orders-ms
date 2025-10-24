import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { $Enums, OrderStatus, PrismaClient } from '@prisma/client';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { ChangeOrderStatusDto, PaidOrderDto } from './dto';
import { NATS_SERVICE } from 'src/config';
import { firstValueFrom } from 'rxjs';
import { OrderItem } from './interfaces/order-item.interface';
import { Product } from './interfaces/product.interface';
import { OrderWithProduct } from './interfaces/order-with-products.interface';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject(NATS_SERVICE)
    private readonly client: ClientProxy,
  ) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('OrdersService connected to the database');
  }

  async create(createOrderDto: CreateOrderDto): Promise<OrderWithProduct> {
    try {
      this.logger.log('Getting items ids to validate');
      const ids = createOrderDto.items.map((item) => item.productId);

      this.logger.log(ids);

      this.logger.log(`Validating products: ${ids.join('-')}`);
      const products: Product[] = await firstValueFrom(
        this.client.send({ cmd: 'validate_products' }, ids),
      );

      this.logger.log(`Replacing items.`);
      const replaceItems = createOrderDto.items.reduce(
        (newItems, orderItem) => {
          const findItem = products.find(
            (pro) => pro.id == orderItem.productId,
          );

          if (!findItem) {
            throw new RpcException({
              statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
              message: `Error al encontrar el producto: ${orderItem.productId}`,
            });
          }
          const newItem: OrderItem = {
            price: findItem?.price,
            productId: findItem?.id,
            quantity: orderItem.quantity,
            name: findItem.name,
          };
          newItems.push(newItem);
          return newItems;
        },
        [] as OrderItem[],
      );

      this.logger.log(`Calculate totals.`);
      const { totalAmount, totalItems } = replaceItems.reduce(
        (acc, orderItem) => {
          const amount = orderItem.quantity * orderItem.price;
          const count = orderItem.quantity;
          acc.totalAmount += amount;
          acc.totalItems += count;
          return acc;
        },
        { totalAmount: 0, totalItems: 0 },
      );

      this.logger.log(`Saving order.`);
      const order = await this.order.create({
        data: {
          totalAmount,
          totalItems,
          OrderItem: {
            createMany: {
              data: replaceItems,
            },
          },
          OrderStatusLog: {
            create: {
              newStatus: OrderStatus.CREATED,
              timestamp: new Date(),
              changedBy: 'consumer',
            },
          },
        },
        include: {
          OrderItem: {
            select: {
              price: true,
              productId: true,
              quantity: true,
            },
          },
        },
      });

      const orderCreated: OrderWithProduct = {
        ...order,
        OrderItem: order.OrderItem.map((item) => ({
          ...item,
          name: products.find((product) => product.id == item.productId)?.name,
        })),
      };

      return orderCreated;
    } catch (err) {
      throw new RpcException(err);
    }
  }

  async findAll(orderPaginationDto: OrderPaginationDto) {
    const { limit, page, status } = orderPaginationDto;
    const totalOrders = await this.order.count({ where: { status } });
    return {
      data: await this.order.findMany({
        take: limit,
        skip: (page - 1) * limit,
        where: {
          status,
        },
      }),
      meta: {
        total: totalOrders,
        page,
        lastPage: Math.ceil(totalOrders / limit),
      },
    };
  }

  async findOne(id: string) {
    const order = await this.order.findUnique({
      where: { id },
      include: {
        OrderItem: {
          select: {
            price: true,
            quantity: true,
            productId: true,
          },
        },
      },
    });

    if (!order) {
      throw new RpcException({
        statusCode: HttpStatus.NOT_FOUND,
        code: 'NOT_FOUND',
        message: `Order with id '${id}' not found`,
      });
    }
    const ids = order.OrderItem.map((item) => item.productId);
    const products: Product[] = await firstValueFrom(
      this.client.send({ cmd: 'validate_products' }, ids),
    );
    return {
      ...order,
      OrderItem: order.OrderItem.map((item) => ({
        ...item,
        name: products.find((product) => product.id == item.productId)?.name,
      })),
    };
  }

  async changeOrderStatus(changeOrderStatusDto: ChangeOrderStatusDto) {
    const { id, status } = changeOrderStatusDto;
    try {
      return await this.order.update({
        where: { id },
        data: { status },
      });
    } catch (err) {
      throw new RpcException({
        statusCode: HttpStatus.NOT_FOUND,
        message: `Order with id ${id} not fount`,
      });
    }
  }

  async createPaymentSession(order: OrderWithProduct) {
    try {
      this.logger.log('Creating payment session');

      const paymentSession = await firstValueFrom(
        this.client.send('create.payment.session', {
          orderId: order.id,
          currency: 'usd',
          items: order.OrderItem.map((item) => ({
            name: item.name,
            price: item.price,
            quantity: item.quantity,
          })),
        }),
      );
      return paymentSession;
    } catch (err) {
      this.logger.debug(err);
      throw new RpcException(err);
    }
  }

  async paidOrder(paidOrderDto: PaidOrderDto) {
    const order = await this.order.update({
      where: { id: paidOrderDto.orderId },
      data: {
        paid: true,
        paidAt: new Date(),
        paymentChargeId: paidOrderDto.paymentChargeId,

        OrderReceipt: {
          create: {
            receiptUrl: paidOrderDto.receiptUrl,
          },
        },
      },
    });
    console.log(order);
    if (order) this.logger.log(`Order marked as paid successful: ${order.id}`);
  }
}
