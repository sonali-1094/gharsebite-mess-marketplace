import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { createApiClient, getChefFoods, getChefOrders, getChefSummary } from "../services/api.js";

const ChefDashboard = () => {
  const { getToken } = useAuth();
  const api = useMemo(() => createApiClient(getToken), [getToken]);
  const [summary, setSummary] = useState(null);
  const [foods, setFoods] = useState([]);
  const [orders, setOrders] = useState([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      setIsLoading(true);
      setMessage("");
      try {
        const [summaryData, foodData, orderData] = await Promise.all([
          getChefSummary(api),
          getChefFoods(api),
          getChefOrders(api)
        ]);
        setSummary(summaryData);
        setFoods(foodData);
        setOrders(orderData);
      } catch (error) {
        setMessage(error.message);
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboard();
  }, [api]);

  const preparingCount = orders.filter((order) => order.status === "Preparing").length;

  return (
    <main className="dashboard">
      <section className="hero-panel">
        <p className="eyebrow">Chef Panel</p>
        <h1>Cook, confirm, and keep today moving</h1>
        <p>Track your menu, assigned orders, and earnings from one place.</p>
        <div className="button-row">
          <Link className="link-button" to="/chef/add-food">Add food</Link>
          <Link className="link-button link-button--light" to="/chef/orders">View orders</Link>
        </div>
      </section>

      {message ? <p className="message">{message}</p> : null}
      {isLoading ? <p className="loading-text">Loading chef dashboard...</p> : null}

      <section className="stats">
        <article>
          <span>Total orders</span>
          <strong>{summary?.totalOrders || 0}</strong>
        </article>
        <article>
          <span>Today's orders</span>
          <strong>{summary?.todaysOrders || 0}</strong>
        </article>
        <article>
          <span>Earnings</span>
          <strong>Rs. {summary?.earnings || 0}</strong>
        </article>
        <article>
          <span>Preparing now</span>
          <strong>{preparingCount}</strong>
        </article>
      </section>

      <section className="two-column">
        <div className="panel">
          <h2>Today's menu</h2>
          <div className="mini-list">
            {foods.filter((food) => food.isTodayMenu).slice(0, 5).map((food) => (
              <div key={food._id} className="mini-row">
                <span>{food.name}</span>
                <strong>Rs. {food.price}</strong>
              </div>
            ))}
            {!foods.filter((food) => food.isTodayMenu).length ? <p>No menu items enabled for today.</p> : null}
          </div>
        </div>

        <div className="panel">
          <h2>Recent orders</h2>
          <div className="mini-list">
            {orders.slice(0, 5).map((order) => (
              <div key={order._id} className="mini-row">
                <span>#{order._id.slice(-6)} · {order.status}</span>
                <strong>Rs. {order.totalAmount}</strong>
              </div>
            ))}
            {!orders.length ? <p>No orders yet.</p> : null}
          </div>
        </div>
      </section>
    </main>
  );
};

export default ChefDashboard;
