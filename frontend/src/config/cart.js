export const DELIVERY_FEE = 40;

export const getDeliveryFee = (subtotal) => (subtotal > 0 ? DELIVERY_FEE : 0);

export const getOrderTotal = (subtotal) => subtotal + getDeliveryFee(subtotal);
