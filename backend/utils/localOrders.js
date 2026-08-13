const localOrders = [];

const createLocalId = () =>
  `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

export const createLocalOrder = (payload) => {
  const now = new Date();
  const order = {
    _id: createLocalId(),
    status: "Pending",
    paymentStatus: "Pending",
    paymentMethod: "COD",
    paymentId: "",
    paidAt: null,
    createdAt: now,
    updatedAt: now,
    ...payload
  };

  localOrders.unshift(order);
  return order;
};

export const getLocalOrders = () => localOrders;

export const findLocalOrderById = (orderId) =>
  localOrders.find((order) => String(order._id) === String(orderId));
