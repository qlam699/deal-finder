import { NextResponse } from "next/server";
import {
  getListingCheckStatus,
  startListingCheckBackground,
} from "@/lib/listing-check-jobs";

export async function GET() {
  return NextResponse.json(getListingCheckStatus());
}

export async function POST() {
  return NextResponse.json(startListingCheckBackground());
}