import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import OrderTable from "../components/OrderTable.jsx";
import { createApiClient, getChefOrders, updateOrderStatus } from "../services/api.js";

const ChefOrders = () => {
  const { getToken } = useAuth();
  const api = useMemo(() => createApiClient(getToken), [getToken]);
  const [orders, setOrders] = useState([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadOrders = async () => {
    setIsLoading(true);
    setMessage("");
    try {
      setOrders(await getChefOrders(api));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [api]);

  const handleStatusChange = async (orderId, status) => {
    try {
      await updateOrderStatus(api, orderId, status);
      await loadOrders();
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <main className="dashboard">
      <section className="hero-panel">
        <p className="eyebrow">Chef Orders</p>
        <h1>Manage assigned orders</h1>
        <p>Accept orders, mark them as preparing, and close them after delivery.</p>
        <button type="button" onClick={loadOrders}>{isLoading ? "Refreshing..." : "Refresh orders"}</button>
      </section>

      {message ? <p className="message">{message}</p> : null}
      <OrderTable orders={orders} isLoading={isLoading} onStatusChange={handleStatusChange} />
    </main>
  );
};

export default ChefOrders;
