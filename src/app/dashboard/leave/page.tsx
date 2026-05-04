import { redirect } from "next/navigation";

export default function LeaveRedirectPage() {
  redirect("/dashboard/leaves");
}
