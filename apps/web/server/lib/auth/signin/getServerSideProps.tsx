import type { GetServerSidePropsContext } from "next";

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const csrfToken = globalThis.crypto.randomUUID();
  // Providers are now configured in better-auth, not fetched from next-auth
  const providers = null;
  return {
    props: {
      csrfToken,
      providers,
    },
  };
}
