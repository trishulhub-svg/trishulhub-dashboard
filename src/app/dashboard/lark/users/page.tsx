import { redirect } from "next/navigation";
export default function LarkUsersPage() {
  redirect("/dashboard/access-hub?tab=lark-users");
}