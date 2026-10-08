/**
 * One row of the account page: its title and a line of explanation on the left, the content on
 * the right (stacked on phones), separated from the row above by a hairline.
 */
export function AccountSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="grid gap-6 border-t py-block md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-x-block">
      <div className="flex flex-col gap-2">
        <h2 id={id} className="eyebrow">
          {title}
        </h2>
        <p className="text-caption text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
