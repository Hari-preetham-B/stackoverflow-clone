import Mainlayout from "@/layout/Mainlayout";
import { Card, CardContent } from "@/components/ui/card";
import axiosInstance from "@/lib/axiosinstance";
import Link from "next/link";
import { useEffect, useState } from "react";

type Tag = { name: string; count: number };

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    axiosInstance
      .get("/question/tags")
      .then((r) => {
        if (active) setTags(r.data.data || []);
      })
      .catch(() => {
        if (active) setError("Unable to load tags");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Mainlayout>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold">Tags</h1>
        <p className="text-gray-600 mt-1 mb-6 text-sm">
          A tag is a keyword that categorises your question with other, similar questions.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {!error && !tags && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500" />
            Loading tags…
          </div>
        )}

        {tags && tags.length === 0 && (
          <Card>
            <CardContent className="text-sm text-gray-600 pt-6">
              No tags yet. Tags appear here once questions are asked.
            </CardContent>
          </Card>
        )}

        {tags && tags.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tags.map((tag) => (
              <Link
                key={tag.name}
                href={`/tags/${encodeURIComponent(tag.name)}`}
                className="block rounded-md border border-gray-200 bg-white p-4 hover:border-blue-400 hover:bg-blue-50/40 transition-colors"
              >
                <span className="inline-block rounded bg-blue-100 px-2 py-0.5 text-sm text-blue-800 font-medium break-all">
                  {tag.name}
                </span>
                <p className="mt-2 text-xs text-gray-600">
                  {tag.count} {tag.count === 1 ? "question" : "questions"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Mainlayout>
  );
}
