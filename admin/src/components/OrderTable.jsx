import EmptyState from "./EmptyState.jsx";
import StatusBadge from "./StatusBadge.jsx";

const getOrderItems = (order) =>
  order.items?.map((item) => `${item.name} x ${item.quantity}`).join(", ") || "No items";

const OrderTable = ({ orders, isLoading, onStatusChange, showChef = false }) => {
  if (isLoading) {
    return <p className="loading-text">Loading orders...</p>;
  }

  if (!orders.length) {
    return <EmptyState title="No orders yet" message="Orders will appear here as customers place them." />;
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Items</th>
            <th>User info</th>
            {showChef ? <th>Chef</th> : null}
            <th>Payment</th>
            <th>Status</th>
            {onStatusChange ? <th>Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order._id}>
              <td>
                <strong>#{order._id.slice(-6)}</strong>
                <span>Rs. {order.totalAmount}</span>
              </td>
              <td>{getOrderItems(order)}</td>
              <td>{order.address || "Hostel and room not provided"}</td>
              {showChef ? <td>{order.chefName || order.shopName || "Unassigned"}</td> : null}
              <td><StatusBadge status={order.paymentStatus} type="payment" /></td>
              <td><StatusBadge status={order.status} /></td>
              {onStatusChange ? (
                <td>
                  <div className="button-row">
                    <button type="button" onClick={() => onStatusChange(order._id, "confirmed")}>
                      Accept
                    </button>
                    <button type="button" onClick={() => onStatusChange(order._id, "preparing")}>
                      Preparing
                    </button>
                    <button type="button" onClick={() => onStatusChange(order._id, "delivered")}>
                      Delivered
                    </button>
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default OrderTable;
