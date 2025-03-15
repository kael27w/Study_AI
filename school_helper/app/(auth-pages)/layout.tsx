export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-7xl w-full flex flex-col gap-12 items-center justify-center min-h-[calc(100vh-4rem)] mx-auto px-4">{children}</div>
  );
}
