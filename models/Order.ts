import mongoose, { mongo, Schema } from "mongoose";
import { IOrder } from "../types/index.js";

const orderItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
    },
    name: { type: String },
    quantity: {
        type: Number,
        required: true,
        min: 1,
    },
    price: { type: Number, required: true },
    size: { type: String },
});

const orderSchema = new mongoose.Schema<IOrder>(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        orderNumber: { type: String, unique: true },
        items: [orderItemSchema],
        shippingAddress: {
            street: { type: String, required: true },
            city: { type: String, required: true },
            state: { type: String, required: true },
            zipCode: { type: String, required: true },
            country: { type: String, required: true },
        },
        paymentMethod: {
            type: String,
            required: true,
            enum: ["cash", "stripe"],
            default: "cash",
        },
        paymentStatus: {
            type: String,
            enum: ["pending", "paid", "failed", "refund", "refunded"],
            default: "pending",
        },
        orderStatus: {
            type: String,
            enum: ["placed", "processing", "shipped", "delivered", "cancelled"],
            default: "placed",
        },
        subtotal: { type: Number, required: true },
        shippingCost: { type: Number, default: 2 },
        tax: { type: Number, default: 0 },
        totalAmount: { type: Number, required: true, default: 0 },
        notes: String,
        deliveredAt: Date,
    },
    { timestamps: true },
);

orderSchema.pre("validate", function (next) {
    // ensure numeric fields are always present so client toFixed calls don't crash
    if (this.shippingCost == null) this.shippingCost = 2;
    if (this.tax == null) this.tax = 0;
    if (this.subtotal == null) this.subtotal = 0;
    if (this.totalAmount == null) {
        this.totalAmount = (this.subtotal || 0) + (this.shippingCost || 0) + (this.tax || 0);
    }
    next();
});

const Order = mongoose.model<IOrder>("Order", orderSchema);

export default Order;
