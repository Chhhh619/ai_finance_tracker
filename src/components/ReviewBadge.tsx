export default function ReviewBadge({ count }: { count: number }) {
  if (count === 0) return null;

  return <span className="review-badge">{count > 99 ? "99+" : count}</span>;
}
