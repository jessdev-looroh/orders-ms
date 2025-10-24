import { OrderStatus } from "@prisma/client";
import { OrderItem } from "./order-item.interface";

export interface OrderWithProduct {
    id:          string;
    totalAmount: number;
    totalItems:  number;
    status:      OrderStatus;
    paid:        boolean;
    paidAt:      Date | null;
    createdAt:   Date;
    updatedAt:   Date;
    OrderItem:   OrderItem[];
}


