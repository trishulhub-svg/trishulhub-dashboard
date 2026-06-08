import { redirect } from "next/navigation";

export default function CredentialsLoadingRedirect() {
  redirect("/dashboard/access-hub");
}
