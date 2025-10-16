import {
  HttpCode,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus, PrismaClient } from '@prisma/client';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { DefaultArgs } from '@prisma/client/runtime/library';
import { ChangeOrderStatusDto } from './dto';
import { STATUS_CODES } from 'http';
import { NATS_SERVICE, PRODUCTS_SERVICE } from 'src/config';
import { firstValueFrom } from 'rxjs';
import { OrderItem } from './interfaces/order-item';
import { Product } from './interfaces/product';

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

  async create(createOrderDto: CreateOrderDto) {
    try {
      //? 1. Confirmar los ids de los productos
      const ids = createOrderDto.items.map((item) => item.productId);

      const products: Product[] = await firstValueFrom(
        this.client.send({ cmd: 'validate_products' }, ids),
      );

      //? 2. Cálculos de los valores
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
          };
          newItems.push(newItem);
          return newItems;
        },
        [] as OrderItem[],
      );
      const { totalAmount, totalItems } = replaceItems.reduce(
        (acc, orderItem) => {
          console.log(acc);
          const amount = orderItem.quantity * orderItem.price;
          const count = orderItem.quantity;
          acc.totalAmount += amount;
          acc.totalItems += count;
          return acc;
        },
        { totalAmount: 0, totalItems: 0 },
      );
      //? 3. Crear transacción de base de datos
      const order = await this.order.create({
        data: {
          totalAmount,
          totalItems,
          OrderItem: {
            createMany: {
              data: replaceItems,
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

      return {
        ...order,
        OrderItem: order.OrderItem.map((orderItem) => ({
          ...orderItem,
          name: products.find((product) => product.id == orderItem.productId)
            ?.name,
        })),
      };
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
}
