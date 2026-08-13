const normalize = (value = "") => String(value).toLowerCase().replace(/\s+/g, "-");

const StatusBadge = ({ status, type = "order" }) => (
  <span className={`status-badge status-badge--${type} status-badge--${normalize(status)}`}>
    {status || "Unknown"}
  </span>
);

export default StatusBadge;
