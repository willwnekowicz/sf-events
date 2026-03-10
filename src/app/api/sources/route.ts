import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sources } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const allSources = await db.select().from(sources);
  return NextResponse.json(allSources);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, type, url, searchQuery } = body;

  if (!name || !type) {
    return NextResponse.json({ error: "Name and type required" }, { status: 400 });
  }
  if (type === "venue" && !url) {
    return NextResponse.json({ error: "URL required for venue sources" }, { status: 400 });
  }
  if (type === "platform" && !searchQuery) {
    return NextResponse.json({ error: "Search query required for platform sources" }, { status: 400 });
  }

  const result = await db.insert(sources).values({
    name,
    type,
    url: url ?? null,
    searchQuery: searchQuery ?? null,
    enabled: 1,
  });

  return NextResponse.json({ success: true, id: result.lastInsertRowid });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, enabled } = body;

  if (id === undefined || enabled === undefined) {
    return NextResponse.json({ error: "id and enabled required" }, { status: 400 });
  }

  await db.update(sources).set({ enabled }).where(eq(sources.id, id));
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  await db.delete(sources).where(eq(sources.id, parseInt(id)));
  return NextResponse.json({ success: true });
}
