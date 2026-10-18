import { redirect } from "next/navigation";

/** The admin opens on its products. */
export default function AdminPage() {
  redirect("/admin/products");
}
