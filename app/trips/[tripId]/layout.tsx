import { RefreshOnFocus } from "./refresh-on-focus";

// Every page of a Trip: the Trip itself, a Stop and an Item.
export default function TripLayout({ children }: LayoutProps<"/trips/[tripId]">) {
  return (
    <>
      <RefreshOnFocus />
      {children}
    </>
  );
}
