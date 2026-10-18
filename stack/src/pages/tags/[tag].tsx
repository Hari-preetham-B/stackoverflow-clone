import Mainlayout from "@/layout/Mainlayout";
import { Card, CardContent } from "@/components/ui/card";
import axiosInstance from "@/lib/axiosinstance";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

type Question = {
  _id: string;
  questiontitle: string;
  questionbody: string;
  questiontags: string[];
  noofanswer: number;
  upvote: number;
  userposted: string;
  askedon: string;
};

const excerpt = (body: string) =>
  (body || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 220);

// `upvote` is stored as an array of voter ids, not a number. Rendering it raw
// would print the whole id list, so always render its length.
const voteCount = (upvote: unknown) => (Array.isArray(upvote) ? upvote.length : Number(upvote) || 0);

export default function TagPage() {
  const router = useRouter();
  const rawTag = router.query?.tag;
  const tag = Array.isArray(rawTag) ? rawTag[0] : rawTag;

  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady || !tag) return;
    let active = true;
    setQuestions(null);
    setError(null);
    axiosInstance
      .get(`/question/tag/${encodeURIComponent(tag)}`)
      .then((r) => {
        if (!active) return;
        setQuestions(r.data.data || []);
        setTotal(r.data.pagination?.total ?? 0);
      })
      .catch((e) => {
        if (active) setError(e.response?.data?.message || "Unable to load questions for this tag");
      });
    return () => {
      active = false;
    };
  }, [router.isReady, tag]);

  return (
    <Mainlayout>
      <div className="max-w-5xl mx-auto">
        <h1 className="sr-only">Questions tagged {tag}</h1>
        <nav className="text-xs text-gray-500 mb-2">
          <Link href="/tags" className="hover:text-blue-700">Tags</Link>
          <span className="mx-1">/</span>
          <span className="text-gray-700">{tag}</span>
        </nav>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <span className="rounded bg-blue-100 px-2.5 py-1 text-blue-800 font-medium break-all">
            {tag}
          </span>
          {questions && (
            <span className="text-sm text-gray-600">
              {total} {total === 1 ? "question" : "questions"}
            </span>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {!error && !questions && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500" />
            Loading questions…
          </div>
        )}

        {questions && questions.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-sm text-gray-600">
              No questions are tagged <span className="font-medium">{tag}</span> yet.
            </CardContent>
          </Card>
        )}

        {questions && questions.length > 0 && (
          <div className="space-y-4">
            {questions.map((question) => (
              <Link
                key={question._id}
                href={`/questions/${question._id}`}
                className="block rounded-md border border-gray-200 bg-white p-4 hover:border-blue-400 transition-colors"
              >
                <div className="flex flex-wrap gap-3 text-xs text-gray-600 mb-2">
                  <span className="rounded bg-green-100 px-2 py-0.5 text-green-800">
                    {voteCount(question.upvote)} votes
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 ${
                      question.noofanswer > 0
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {question.noofanswer ?? 0} answers
                  </span>
                  <span className="self-center">asked {new Date(question.askedon).toLocaleDateString()}</span>
                </div>

                <h2 className="text-base font-medium text-blue-700 break-words">
                  {question.questiontitle}
                </h2>
                <p className="mt-1 text-sm text-gray-700 break-words">{excerpt(question.questionbody)}</p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {(question.questiontags || []).map((t) => (
                    <span
                      key={t}
                      className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800 break-all"
                    >
                      {t}
                    </span>
                  ))}
                  <span className="text-xs text-gray-600 ml-1">{question.userposted}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Mainlayout>
  );
}
