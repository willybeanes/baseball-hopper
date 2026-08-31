import type { Metadata } from "next";
import { Suspense } from "react";
import BatteryApp from "./BatteryApp";

export const metadata: Metadata = {
  title: "Battery Splits — Baseball Hopper",
  description: "MLB pitcher leaderboard with catcher presence filter — powered by Retrosheet",
};

export default function BatteryPage() {
  return (
    <Suspense>
      <BatteryApp />
    </Suspense>
  );
}
