import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import EmptyState from "../components/EmptyState.jsx";
import OrderTable from "../components/OrderTable.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import {
  createApiClient,
  getAdminStats,
  getAllOrders,
  getChefs,
  getAdminMesses,
  getAdminMenus,
  updateMessStatus,
  moderateMenu,
  updateChefApproval,
  updateOrderStatus
} from "../services/api.js";

const statusOptions = ["all", "Pending", "Accepted", "Preparing", "Out for Delivery", "Delivered", "Cancelled"];
const paymentOptions = ["all", "Pending", "Processing", "Paid", "Failed"];

const AdminDashboard = () => {
  const { getToken } = useAuth();
  const api = useMemo(() => createApiClient(getToken), [getToken]);
  const [activeTab, setActiveTab] = useState("overview");
  const [stats, setStats] = useState({ totalOrders: 0, totalRevenue: 0, activeChefs: 0 });
  const [orders, setOrders] = useState([]);
  const [chefs, setChefs] = useState([]);
  const [messes, setMesses] = useState([]);
  const [menus, setMenus] = useState([]);
  const [filters, setFilters] = useState({ status: "all", paymentStatus: "all" });
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadDashboard = async () => {
    setIsLoading(true);
    setMessage("");
    try {
      const [statsData, orderData, chefData, messData, menuData] = await Promise.all([
        getAdminStats(api),
        getAllOrders(api),
        getChefs(api), getAdminMesses(api), getAdminMenus(api)
      ]);
      setStats(statsData);
      setOrders(orderData);
      setChefs(chefData);
      setMesses(messData);
      setMenus(menuData);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [api]);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const statusMatch = filters.status === "all" || order.status === filters.status;
      const paymentMatch = filters.paymentStatus === "all" || order.paymentStatus === filters.paymentStatus;
      return statusMatch && paymentMatch;
    });
  }, [orders, filters]);

  const pendingChefs = chefs.filter((chef) => chef.approvalStatus === "pending").length;

  const handleChefAction = async (chefId, action) => {
    try {
      await updateChefApproval(api, chefId, action);
      setMessage(action === "reject" ? "Chef rejected." : "Chef approved.");
      setChefs(await getChefs(api));
    } catch (error) {
      setMessage(error.message);
    }
  };

  const handleOrderStatus = async (orderId, status) => {
    try {
      await updateOrderStatus(api, orderId, status);
      setOrders(await getAllOrders(api));
    } catch (error) {
      setMessage(error.message);
    }
  };

  const handleMessStatus = async (mess, status) => {
    const action = status === "suspended" ? "suspend" : status;
    if (!window.confirm(`Are you sure you want to ${action} ${mess.name}?`)) return;
    try { await updateMessStatus(api, mess._id, status); setMesses(await getAdminMesses(api)); setStats(await getAdminStats(api)); }
    catch (error) { setMessage(error.message); }
  };

  const handleMenuModeration = async (menu) => {
    const next = !menu.isAvailable;
    if (!window.confirm(`${next ? "Restore" : "Hide"} this menu from students?`)) return;
    try { await moderateMenu(api, menu._id, next); setMenus(await getAdminMenus(api)); }
    catch (error) { setMessage(error.message); }
  };

  return (
    <main className="dashboard">
      <section className="hero-panel">
        <p className="eyebrow">Admin Panel</p>
        <h1>GharSeBite Admin Dashboard</h1>
        <p>Manage students, messes, menus and orders in your local marketplace.</p>
        <button type="button" onClick={loadDashboard}>{isLoading ? "Refreshing..." : "Refresh dashboard"}</button>
      </section>

      {message ? <p className="message">{message}</p> : null}

      <nav className="tabs">
        <button className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab("overview")}>Overview</button>
        <button className={activeTab === "chefs" ? "active" : ""} onClick={() => setActiveTab("chefs")}>Chef Approval</button>
        <button className={activeTab === "messes" ? "active" : ""} onClick={() => setActiveTab("messes")}>Messes</button>
        <button className={activeTab === "menus" ? "active" : ""} onClick={() => setActiveTab("menus")}>Menus</button>
        <button className={activeTab === "orders" ? "active" : ""} onClick={() => setActiveTab("orders")}>Order Monitoring</button>
      </nav>

      {activeTab === "overview" ? (
        <>
          <section className="stats">
            <article>
              <span>Total orders</span>
              <strong>{stats.totalOrders}</strong>
            </article>
            <article>
              <span>Total revenue</span>
              <strong>Rs. {stats.totalRevenue}</strong>
            </article>
            <article>
              <span>Active chefs</span>
              <strong>{stats.activeChefs}</strong>
            </article>
            <article>
              <span>Pending approvals</span>
              <strong>{stats.pendingMesses ?? pendingChefs}</strong>
            </article>
            <article><span>Active messes</span><strong>{stats.activeMesses ?? 0}</strong></article>
            <article><span>Today's orders</span><strong>{stats.todaysOrders ?? 0}</strong></article>
            <article><span>Today's gross order value</span><strong>Rs. {stats.todayGrossOrderValue ?? 0}</strong></article>
          </section>

          <section className="two-column">
            <div className="panel">
              <h2>Latest orders</h2>
              <div className="mini-list">
                {orders.slice(0, 5).map((order) => (
                  <div className="mini-row" key={order._id}>
                    <span>#{order._id.slice(-6)} · {order.status}</span>
                    <strong>Rs. {order.totalAmount}</strong>
                  </div>
                ))}
                {!orders.length ? <p>No orders yet.</p> : null}
              </div>
            </div>

            <div className="panel">
              <h2>Chef queue</h2>
              <div className="mini-list">
                {chefs.slice(0, 5).map((chef) => (
                  <div className="mini-row" key={chef.id}>
                    <span>{chef.name}</span>
                    <StatusBadge status={chef.approvalStatus} type="approval" />
                  </div>
                ))}
                {!chefs.length ? <p>No chef accounts found.</p> : null}
              </div>
            </div>
          </section>
        </>
      ) : null}

      {activeTab === "chefs" ? (
        <section className="grid-list">
          {isLoading ? <p className="loading-text">Loading chefs...</p> : null}
          {!isLoading && !chefs.length ? <EmptyState title="No chefs found" message="Chef accounts with role metadata will appear here." /> : null}
          {chefs.map((chef) => (
            <article className="food-row" key={chef.id}>
              <div>
                <h3>{chef.name}</h3>
                <p>{chef.email || "No email"} · <StatusBadge status={chef.approvalStatus} type="approval" /></p>
              </div>
              <div className="button-row">
                <button type="button" disabled={chef.approvalStatus === "approved"} onClick={() => handleChefAction(chef.id, "approve")}>
                  Approve
                </button>
                <button type="button" className="danger-button" disabled={chef.approvalStatus === "rejected"} onClick={() => handleChefAction(chef.id, "reject")}>
                  Reject
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {activeTab === "messes" ? <section className="grid-list">
        {!isLoading && !messes.length ? <EmptyState title="No messes found" message="New mess registrations will appear here." /> : null}
        {messes.map((mess) => <article className="food-row" key={mess._id}><div><h3>{mess.name}</h3><p>{mess.area} · {mess.address} · {mess.phone || "No phone"}</p><StatusBadge status={mess.approvalStatus} type="approval" /></div><div className="button-row"><button disabled={mess.approvalStatus === "approved"} onClick={() => handleMessStatus(mess, "approved")}>Approve</button><button className="danger-button" disabled={mess.approvalStatus === "suspended"} onClick={() => handleMessStatus(mess, "suspended")}>Suspend</button><button className="danger-button" disabled={mess.approvalStatus === "rejected"} onClick={() => handleMessStatus(mess, "rejected")}>Reject</button></div></article>)}
      </section> : null}

      {activeTab === "menus" ? <section className="grid-list">
        {!isLoading && !menus.length ? <EmptyState title="No menus found" message="Owner-published menus will appear here." /> : null}
        {menus.map((menu) => <article className="food-row" key={menu._id}><div><h3>{menu.messId?.name || "Unknown mess"} · {menu.mealType}</h3><p>{menu.items?.map((item) => item.name).join(", ")} · Rs. {menu.price} · {new Date(menu.date).toLocaleDateString()}</p><StatusBadge status={menu.isAvailable ? "approved" : "rejected"} type="approval" /></div><div className="button-row"><button className={menu.isAvailable ? "danger-button" : ""} onClick={() => handleMenuModeration(menu)}>{menu.isAvailable ? "Hide menu" : "Restore menu"}</button></div></article>)}
      </section> : null}

      {activeTab === "orders" ? (
        <section className="dashboard">
          <div className="filters">
            <label>
              Status
              <select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}>
                {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label>
              Payment
              <select value={filters.paymentStatus} onChange={(event) => setFilters((prev) => ({ ...prev, paymentStatus: event.target.value }))}>
                {paymentOptions.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
          </div>
          <OrderTable orders={filteredOrders} isLoading={isLoading} onStatusChange={handleOrderStatus} showChef />
        </section>
      ) : null}
    </main>
  );
};

export default AdminDashboard;
