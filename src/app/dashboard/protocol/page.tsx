import { redirect } from "next/navigation";

export default function ProtocolRedirect() {
  redirect("/dashboard/access-hub");
}
