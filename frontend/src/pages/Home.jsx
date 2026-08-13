import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { StoreContext } from "../context/StoreContext";
import { API_BASE_URL } from "../config/api";
import "./Home.css";

const areas = ["Campus Area", "Area A", "Area B", "Area C"];
const mealTypes = ["ALL", "BREAKFAST", "LUNCH", "SNACKS", "DINNER"];
const label = (value) => value === "ALL" ? "All meals" : value[0] + value.slice(1).toLowerCase();

const Home = () => {
  const navigate = useNavigate();
  const { setFoodList, addToCart, cartMessId, clearCart } = useContext(StoreContext);
  const [area, setArea] = useState(localStorage.getItem("gharsebite-area") || "Campus Area");
  const [mealType, setMealType] = useState("ALL");
  const [diet, setDiet] = useState("ALL");
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { localStorage.setItem("gharsebite-area", area); }, [area]);
  useEffect(() => {
    const load = async () => {
      setLoading(true); setError("");
      try {
        const params = new URLSearchParams({ area });
        if (mealType !== "ALL") params.set("mealType", mealType);
        if (diet !== "ALL") params.set("dietaryType", diet);
        const response = await fetch(`${API_BASE_URL}/api/messes/today?${params}`);
        if (!response.ok) throw new Error();
        const result = await response.json();
        setMenus(result);
        setFoodList(result.map((menu) => ({ _id: menu._id, name: `${menu.mealType[0] + menu.mealType.slice(1).toLowerCase()} meal`, price: menu.price, description: menu.items.map((item) => item.name).join(", "), image: menu.messId.coverImage || "/header_img.png", messId: menu.messId._id, messName: menu.messId.name, deliveryCharge: menu.messId.deliveryCharge })));
      } catch { setError("We couldn't load today's menus. Please check your connection and try again."); setMenus([]); }
      finally { setLoading(false); }
    };
    load();
  }, [area, mealType, diet, setFoodList]);
  const title = useMemo(() => mealType === "ALL" ? "What's Cooking Near You?" : `${label(mealType)} near you`, [mealType]);
  const order = (menu) => {
    if (cartMessId && cartMessId !== menu.messId._id && !window.confirm("Your cart contains items from another mess. Clear your cart and continue with this mess?")) return;
    if (cartMessId && cartMessId !== menu.messId._id) clearCart();
    addToCart(menu._id, menu.messId._id); navigate("/cart");
  };
  return <main className="mess-home">
    <section className="mess-hero">
      <div><p className="eyebrow">GharSeBite · Local mess marketplace</p><h1>Don't like today's<br/><em>mess food?</em></h1><h2>Choose another one.</h2><p className="hero-copy">See fresh menus from nearby messes and order an affordable, home-style meal that suits you.</p><div className="hero-actions"><a href="#today-menu">Explore today's menu</a><a className="quiet" href="#explore-messes">Find nearby messes</a></div></div>
      <aside className="hero-note"><span>YOUR MESS,<br/>YOUR CHOICE.</span><p>Affordable meals<br/>made around you.</p><b>↓</b></aside>
    </section>
    <section className="area-bar" id="explore-messes"><div><small>YOUR AREA</small><strong>📍 {area}</strong></div><select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Select your area">{areas.map((item) => <option key={item}>{item}</option>)}</select><p>Only showing messes serving your selected area.</p></section>
    <section className="how"><p className="eyebrow">HOW GHARSEBITE WORKS</p>{[["01", "Check today's menu", "See what nearby messes are cooking."],["02", "Choose your meal", "Compare food, price and ratings."],["03", "Pickup or delivery", "Collect it or get it locally delivered."]].map(([n,h,p]) => <article key={n}><span>{n}</span><h3>{h}</h3><p>{p}</p></article>)}</section>
    <section className="today" id="today-menu"><div className="section-heading"><div><p className="eyebrow">TODAY'S MENU</p><h2>{title}</h2><p>Mess-style meals, not restaurant food.</p></div><div className="filters">{mealTypes.map((type) => <button key={type} onClick={() => setMealType(type)} className={mealType === type ? "active" : ""}>{label(type)}</button>)}</div></div><div className="filter-row"><button className={diet === "ALL" ? "selected" : ""} onClick={() => setDiet("ALL")}>All</button><button className={diet === "VEG" ? "selected" : ""} onClick={() => setDiet("VEG")}>● Veg</button><button className={diet === "JAIN" ? "selected" : ""} onClick={() => setDiet("JAIN")}>Jain</button><button className={diet === "NON_VEG" ? "selected" : ""} onClick={() => setDiet("NON_VEG")}>Non-veg</button></div>
      {loading ? <p className="state">Loading today's menus…</p> : error ? <p className="state">{error}</p> : menus.length === 0 ? <p className="state">No messes have uploaded today's menu yet. Check back soon.</p> : <div className="menu-grid">{menus.map((menu) => <article className="mess-card" key={menu._id}><div className="card-top"><div className="mess-avatar">{menu.messId.name.slice(0,1)}</div><div><h3>{menu.messId.name}</h3><p>★ {menu.messId.rating?.toFixed(1) || "New"} · 📍 {menu.messId.area}</p></div><span>{label(menu.mealType)}</span></div><div className="meal-items">{menu.items.map((item) => <span key={item._id}>✓ {item.name}</span>)}</div><div className="card-bottom"><div><strong>₹{menu.price}</strong><small>{menu.availableQuantity} plates left</small></div><div className="service">{menu.pickupAvailable && "Pickup"}{menu.pickupAvailable && menu.deliveryAvailable && " · "}{menu.deliveryAvailable && `Delivery ₹${menu.messId.deliveryCharge}`}</div><button onClick={() => order(menu)}>Order meal →</button></div></article>)}</div>}</section>
  </main>;
};
export default Home;
