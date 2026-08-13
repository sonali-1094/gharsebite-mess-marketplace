import React, { useContext, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { StoreContext } from "../context/StoreContext";
import { API_BASE_URL } from "../config/api";
import { getDeliveryFee, getOrderTotal } from "../config/cart";
import "./Placeorder.css";

const loadRazorpayScript = () =>
  new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

const collapseRepeatedMessage = (message = "") => {
  const trimmed = String(message).trim();
  if (!trimmed) return "";

  const half = Math.floor(trimmed.length / 2);
  for (let size = 1; size <= half; size += 1) {
    if (trimmed.length % size !== 0) continue;

    const chunk = trimmed.slice(0, size);
    if (chunk.repeat(trimmed.length / size) === trimmed) {
      return chunk.trim();
    }
  }

  return trimmed;
};

const getApiErrorMessage = (data, fallback, paymentMethod = "RAZORPAY") => {
  const message = collapseRepeatedMessage(data?.message || data?.error || fallback);

  if (/buffering timed out|orders\.insertOne|server selection|not connected|Database is not connected/i.test(message)) {
    if (paymentMethod === "COD") {
      return "Cash on Delivery needs the updated local backend. Restart the backend and try once more.";
    }

    return "Online payment needs MongoDB connected. Start MongoDB or fix the backend database connection, then try Razorpay again.";
  }

  if (/Cast to ObjectId failed/i.test(message)) {
    return "The backend is still running old checkout code. Restart the backend server, then try again.";
  }

  return message;
};

const assertDatabaseReadyForRazorpay = async () => {
  const response = await fetch(`${API_BASE_URL}/api/health`);
  if (!response.ok) {
    throw new Error("Backend is not responding. Start the backend, then try Razorpay again.");
  }

  const health = await response.json();
  if (!health.dbConnected) {
    throw new Error("Online payment needs MongoDB connected. Start MongoDB or fix the backend database connection, then try Razorpay again.");
  }
};

const Placeorder = () => {
  const { food_list, cartItems, clearCart, getTotalCartAmount } = useContext(StoreContext);
  const { isSignedIn, getToken } = useAuth();
  const navigate = useNavigate();

  const [address, setAddress] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("COD");
  const [orderType, setOrderType] = useState("PICKUP");
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [orderedMessage, setOrderedMessage] = useState("");

  const cartSummary = useMemo(() => {
    const items = Object.entries(cartItems)
      .filter(([, quantity]) => quantity > 0)
      .map(([itemId, quantity]) => {
        const item = food_list.find((food) => food._id === itemId);
        if (!item) return null;
        return {
          foodId: item._id,
          messId: item.messId || "",
          name: item.name,
          price: item.price,
          quantity,
        };
      })
      .filter(Boolean);

    const subtotal = getTotalCartAmount();
    const deliveryFee = getDeliveryFee(subtotal);
    const total = getOrderTotal(subtotal);

    return { items, subtotal, deliveryFee, total };
  }, [cartItems, food_list, getTotalCartAmount]);

  const handlePlaceOrder = async (event) => {
    event.preventDefault();

    if (!cartSummary.items.length) {
      setMessage("Cart is empty. Add items before placing an order.");
      return;
    }

    if (!address.trim()) {
      setMessage("Please enter delivery address.");
      return;
    }

    if (!isSignedIn) {
      setMessage("Please sign in before placing an order.");
      navigate("/sign-in");
      return;
    }

    setIsProcessing(true);
    setMessage("");
    setOrderedMessage("");

    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Authentication token not available. Please sign in again.");
      }

      if (paymentMethod === "RAZORPAY") {
        await assertDatabaseReadyForRazorpay();
      }

      const orderResponse = await fetch(`${API_BASE_URL}/api/order/place`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: cartSummary.items,
          totalAmount: cartSummary.total,
          address: address.trim(),
          paymentMethod,
          messId: cartSummary.items[0]?.messId || "",
          orderType,
          deliveryCharge: orderType === "DELIVERY" ? cartSummary.deliveryFee : 0,
        }),
      });

      const orderData = await orderResponse.json();
      if (!orderResponse.ok) {
        throw new Error(getApiErrorMessage(orderData, "Failed to create order.", paymentMethod));
      }

      const appOrderId = orderData.order?._id;
      if (!appOrderId) {
        throw new Error("Order ID missing from backend response.");
      }

      if (paymentMethod === "COD") {
        clearCart();
        setOrderedMessage(
          orderData.localOnly
            ? "Ordered successfully. Cash on Delivery order is saved locally because MongoDB is temporarily unavailable."
            : "Ordered successfully. Cash on Delivery is confirmed."
        );
        setIsProcessing(false);
        return;
      }

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        throw new Error("Unable to load Razorpay checkout script.");
      }

      const paymentResponse = await fetch(`${API_BASE_URL}/api/payment/create-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderId: appOrderId }),
      });

      const paymentData = await paymentResponse.json();
      if (!paymentResponse.ok) {
        throw new Error(getApiErrorMessage(paymentData, "Failed to create payment session."));
      }

      const options = {
        key: paymentData.key,
        amount: paymentData.amount,
        currency: paymentData.currency || "INR",
        name: "GharSeBite",
        description: `Order #${appOrderId.slice(-6)}`,
        order_id: paymentData.razorpayOrderId,
        prefill: {
          name: customerName,
          email,
          contact: phone,
        },
        theme: {
          color: "#e85d04",
        },
        handler: async (razorpayResult) => {
          try {
            const verifyResponse = await fetch(`${API_BASE_URL}/api/payment/verify`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                orderId: appOrderId,
                razorpay_order_id: razorpayResult.razorpay_order_id,
                razorpay_payment_id: razorpayResult.razorpay_payment_id,
                razorpay_signature: razorpayResult.razorpay_signature,
              }),
            });

            const verifyData = await verifyResponse.json();
            if (!verifyResponse.ok) {
              throw new Error(getApiErrorMessage(verifyData, "Payment verification failed."));
            }

            clearCart();
            setOrderedMessage("Ordered successfully. Razorpay payment is confirmed.");
          } catch (error) {
            setMessage(error.message);
          } finally {
            setIsProcessing(false);
          }
        },
        modal: {
          ondismiss: () => {
            setIsProcessing(false);
            setMessage("Payment was not completed.");
          },
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (error) {
      setMessage(error.message);
      setIsProcessing(false);
    }
  };

  return (
    <section className="placeorder">
      <div className="placeorder__grid">
        <form className="placeorder__form" onSubmit={handlePlaceOrder}>
          <h2>Delivery Details</h2>
          <input
            type="text"
            placeholder="Full Name"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="tel"
            placeholder="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <textarea
            placeholder={orderType === "PICKUP" ? "Hostel / contact address" : "Delivery Address"}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows="4"
            required
          />
          <div className="placeorder__payment">
            <h3>Collect your meal</h3>
            <label className={orderType === "PICKUP" ? "selected" : ""}><input type="radio" name="orderType" checked={orderType === "PICKUP"} onChange={() => setOrderType("PICKUP")} /><span><strong>Pickup</strong><small>Collect directly from the mess</small></span></label>
            <label className={orderType === "DELIVERY" ? "selected" : ""}><input type="radio" name="orderType" checked={orderType === "DELIVERY"} onChange={() => setOrderType("DELIVERY")} /><span><strong>Local delivery</strong><small>Delivery charge applies where supported</small></span></label>
          </div>
          <div className="placeorder__payment">
            <h3>Payment Method</h3>
            <label className={paymentMethod === "COD" ? "selected" : ""}>
              <input
                type="radio"
                name="paymentMethod"
                value="COD"
                checked={paymentMethod === "COD"}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              <span>
                <strong>Cash on Delivery</strong>
                <small>Pay when your food arrives</small>
              </span>
            </label>
            <label className={paymentMethod === "RAZORPAY" ? "selected" : ""}>
              <input
                type="radio"
                name="paymentMethod"
                value="RAZORPAY"
                checked={paymentMethod === "RAZORPAY"}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              <span>
                <strong>Razorpay</strong>
                <small>Pay online with UPI, card, or wallet</small>
              </span>
            </label>
          </div>
          <button type="submit" disabled={isProcessing || !cartSummary.items.length}>
            {isProcessing
              ? "Processing..."
              : paymentMethod === "COD"
                ? "Place Order - Cash on Delivery"
                : "Pay with Razorpay"}
          </button>
          {orderedMessage ? <p className="placeorder__message placeorder__message--success">{orderedMessage}</p> : null}
          {message ? <p className="placeorder__message">{message}</p> : null}
        </form>

        <aside className="placeorder__summary">
          <h3>Order Summary</h3>
          <div className="placeorder__items">
            {cartSummary.items.length ? (
              cartSummary.items.map((item) => (
                <div key={item.foodId} className="placeorder__item">
                  <span>{item.name} x {item.quantity}</span>
                  <span>Rs. {item.price * item.quantity}</span>
                </div>
              ))
            ) : (
              <p>Your cart is empty.</p>
            )}
          </div>
          <div className="placeorder__total">
            <span>Subtotal</span>
            <span>Rs. {cartSummary.subtotal}</span>
          </div>
          <div className="placeorder__total">
            <span>Delivery Fee</span>
            <span>Rs. {cartSummary.deliveryFee}</span>
          </div>
          <div className="placeorder__total placeorder__total--payable">
            <span>Payable Total</span>
            <strong>Rs. {cartSummary.total}</strong>
          </div>
        </aside>
      </div>
    </section>
  );
};

export default Placeorder;
