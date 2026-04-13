export default function ReviewBadge({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full">
      {count > 99 ? "99+" : count}
    </span>
  );
}
