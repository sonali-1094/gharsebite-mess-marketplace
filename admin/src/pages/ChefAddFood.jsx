import { useEffect, useMemo, useState } from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import { addFood, createApiClient, getChefFoods, updateFood } from "../services/api.js";
import EmptyState from "../components/EmptyState.jsx";

const initialForm = {
  name: "",
  price: "",
  category: "",
  cuisine: "",
  tags: "",
  image: "",
  description: ""
};

const ChefAddFood = () => {
  const { getToken, userId } = useAuth();
  const { user } = useUser();
  const api = useMemo(() => createApiClient(getToken), [getToken]);
  const [form, setForm] = useState(initialForm);
  const [foods, setFoods] = useState([]);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadFoods = async () => {
    setIsLoading(true);
    try {
      setFoods(await getChefFoods(api));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFoods();
  }, [api]);

  const onFieldChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");

    try {
      await addFood(api, {
        ...form,
        price: Number(form.price),
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        chefId: userId,
        chefName: user?.fullName || user?.primaryEmailAddress?.emailAddress || "Chef",
        shopName: user?.fullName || user?.primaryEmailAddress?.emailAddress || "Chef"
      });
      setForm(initialForm);
      setMessage("Food item added successfully.");
      await loadFoods();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleTodayMenu = async (food) => {
    try {
      await updateFood(api, food._id, { isTodayMenu: !food.isTodayMenu });
      await loadFoods();
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <main className="dashboard">
      <section className="hero-panel">
        <p className="eyebrow">Chef Menu</p>
        <h1>Add food for your kitchen</h1>
        <p>New items are linked to your chef account and can be ordered by customers.</p>
      </section>

      {message ? <p className="message">{message}</p> : null}

      <section className="food-layout">
        <form className="panel" onSubmit={handleSubmit}>
          <h2>Add food</h2>
          <input name="name" value={form.name} onChange={onFieldChange} placeholder="Food name" required />
          <input name="price" value={form.price} onChange={onFieldChange} placeholder="Price" type="number" min="1" required />
          <input name="category" value={form.category} onChange={onFieldChange} placeholder="Category" required />
          <input name="cuisine" value={form.cuisine} onChange={onFieldChange} placeholder="Cuisine" />
          <input name="tags" value={form.tags} onChange={onFieldChange} placeholder="Tags, comma separated" />
          <input name="image" value={form.image} onChange={onFieldChange} placeholder="Image URL" />
          <textarea name="description" value={form.description} onChange={onFieldChange} placeholder="Description" rows="4" />
          <button type="submit" disabled={isSaving}>{isSaving ? "Adding..." : "Add Food"}</button>
        </form>

        <section className="grid-list">
          {isLoading ? <p className="loading-text">Loading menu...</p> : null}
          {!isLoading && !foods.length ? <EmptyState title="No food added yet" message="Add your first dish to start receiving orders." /> : null}
          {foods.map((food) => (
            <article className="food-row" key={food._id}>
              <div>
                <h3>{food.name}</h3>
                <p>{food.category} · {food.cuisine || "Cuisine not set"} · Rs. {food.price}</p>
                <p>{food.tags?.length ? food.tags.join(", ") : "No tags"}</p>
              </div>
              <button type="button" onClick={() => toggleTodayMenu(food)}>
                {food.isTodayMenu ? "Hide today" : "Show today"}
              </button>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
};

export default ChefAddFood;
