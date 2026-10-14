import { redirect } from "next/navigation";

// Transforms are edited inline in each route's pipeline.
export default function TransformsPage() {
  redirect("/dashboard/endpoints");
}
