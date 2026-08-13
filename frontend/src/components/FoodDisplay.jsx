import React, { useContext } from 'react';
import './FoodDisplay.css';
import { StoreContext } from '../context/StoreContext';
import FoodItem from './FoodItem';

const normalizeText = (value) => String(value || '').toLowerCase().trim();

const getSearchableText = (item) => {
  return [
    item.name,
    item.description,
    item.category,
    item.state,
    item.cuisine,
    item.shopName,
    item.chefName,
    ...(Array.isArray(item.tags) ? item.tags : [])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

const FoodDisplay = ({ category }) => {
  const { food_list, searchText } = useContext(StoreContext);
  const normalizedSearch = normalizeText(searchText);
  const isSearching = normalizedSearch.length > 0;

  const filteredList = food_list.filter((item) => {
    const categoryMatch = category === 'All' || item.category === category;
    const searchMatch = getSearchableText(item).includes(normalizedSearch);

    return isSearching ? searchMatch : categoryMatch;
  });

  return (
    <div className='food-display' id='food-display'>
      <div className='food-display-header'>
        <div>
          <h2>{isSearching ? `Search results for "${searchText.trim()}"` : 'Regional healthy picks near you'}</h2>
          <p>
            {isSearching
              ? `${filteredList.length} food item${filteredList.length === 1 ? '' : 's'} found across the full menu`
              : 'Choose a regional plate, tiffin, snack, or bowl for your next meal.'}
          </p>
        </div>
      </div>
      <div className="food-display-list">
        {filteredList.map((item, index) => (
          <FoodItem
            key={item._id || index}
            id={item._id}
            name={item.name}
            description={item.description}
            price={item.price}
            image={item.image}
            state={item.state}
          />
        ))}
      </div>
      {filteredList.length === 0 && (
        <div className='food-display-empty'>
          <h3>No food item found</h3>
          <p>Try searching by dish name, state, cuisine, tag, or ingredient.</p>
        </div>
      )}
    </div>
  );
};

export default FoodDisplay;
