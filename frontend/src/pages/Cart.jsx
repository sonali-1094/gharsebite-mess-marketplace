import React, { useContext, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { StoreContext } from "../context/StoreContext";
import { getDeliveryFee, getOrderTotal } from "../config/cart";
import "./Cart.css";

const Cart = () => {
  const navigate = useNavigate();
  const { food_list, cartItems, addToCart, removeFromCart, getTotalCartAmount } =
    useContext(StoreContext);

  const cartList = useMemo(() => {
    return Object.entries(cartItems)
      .filter(([, quantity]) => quantity > 0)
      .map(([itemId, quantity]) => {
        const item = food_list.find((food) => food._id === itemId);
        if (!item) return null;

        return {
          ...item,
          quantity,
          itemTotal: item.price * quantity,
        };
      })
      .filter(Boolean);
  }, [cartItems, food_list]);

  const subtotal = getTotalCartAmount();
  const deliveryFee = getDeliveryFee(subtotal);
  const total = getOrderTotal(subtotal);

  return (
    <section className="cart-page">
      <h2>Your Cart</h2>

      {!cartList.length ? (
        <div className="cart-empty">
          <p>Your cart is empty.</p>
          <button onClick={() => navigate("/")}>Explore Menu</button>
        </div>
      ) : (
        <div className="cart-layout">
          <div className="cart-items">
            {cartList.map((item) => (
              <article key={item._id} className="cart-item">
                <img src={item.image} alt={item.name} className="cart-item__image" />

                <div className="cart-item__meta">
                  <h3>{item.name}</h3>
                  <p>Rs. {item.price} each</p>
                </div>

                <div className="cart-item__qty">
                  <button onClick={() => removeFromCart(item._id)}>-</button>
                  <span>{item.quantity}</span>
                  <button onClick={() => addToCart(item._id)}>+</button>
                </div>

                <strong>Rs. {item.itemTotal}</strong>
              </article>
            ))}
          </div>

          <aside className="cart-summary">
            <h3>Bill Details</h3>
            <div className="cart-summary__row">
              <span>Subtotal</span>
              <span>Rs. {subtotal}</span>
            </div>
            <div className="cart-summary__row">
              <span>Delivery Fee</span>
              <span>Rs. {deliveryFee}</span>
            </div>
            <div className="cart-summary__row cart-summary__row--total">
              <span>Total</span>
              <strong>Rs. {total}</strong>
            </div>
            <button onClick={() => navigate("/order")}>Proceed to Pay</button>
          </aside>
        </div>
      )}
    </section>
  );
};

export default Cart;
