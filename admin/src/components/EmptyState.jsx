const EmptyState = ({ title = "Nothing here yet", message }) => (
  <div className="empty-state">
    <h3>{title}</h3>
    {message ? <p>{message}</p> : null}
  </div>
);

export default EmptyState;
