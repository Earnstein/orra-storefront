import { Container, Grid, TextLink } from "@/components/primitives";
import { Separator } from "@/components/ui/separator";
import { footerNav, site } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="bg-inverse text-inverse-foreground">
      <Container className="flex flex-col gap-block py-section">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <p className="max-w-prose text-title">
            New arrivals and private appointments, a few times a season.
          </p>
          <TextLink href="/newsletter" label>
            Sign up for updates
          </TextLink>
        </div>

        <Separator className="bg-inverse-foreground/20" />

        <Grid layout="columns">
          {footerNav.map((group) => (
            <nav key={group.title} aria-label={group.title} className="flex flex-col gap-3">
              <h2 className="eyebrow text-inverse-foreground/60">{group.title}</h2>
              <ul className="flex flex-col gap-2">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <TextLink href={link.href} variant="quiet">
                      {link.label}
                    </TextLink>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </Grid>

        <Separator className="bg-inverse-foreground/20" />

        <div className="flex flex-col gap-2 caption text-inverse-foreground/60 sm:flex-row sm:justify-between">
          <p>
            © {new Date().getFullYear()} {site.name}
          </p>
          <p>Prices in {site.currency}</p>
        </div>
      </Container>
    </footer>
  );
}
