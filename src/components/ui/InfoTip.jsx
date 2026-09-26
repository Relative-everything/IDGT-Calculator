export default function InfoTip({ text }) {
  if (!text) return null;
  return (
    <span
      className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-line-strong text-[10px] leading-none text-muted align-middle"
      title={text}
      aria-label={text}
      role="img"
    >
      i
    </span>
  );
}
