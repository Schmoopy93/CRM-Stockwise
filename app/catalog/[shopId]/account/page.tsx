import CustomerAccount from "./customer-account";

export default async function CatalogCustomerAccountPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  return <CustomerAccount shopId={shopId} />;
}
