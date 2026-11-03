export default function Placeholder({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-2xl font-extrabold">{title}</h1>
      <p className="mt-2 text-pb-muted">Coming soon.</p>
    </div>
  );
}
