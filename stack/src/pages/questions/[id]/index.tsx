import QuestionDetail from "@/components/QuestionDetail";
import Mainlayout from "@/layout/Mainlayout";
import { useRouter } from "next/router";
import React from "react";

const index = () => {
  const router = useRouter();
  // `router.query` is empty on the very first render of a dynamic route, so
  // reading `id` straight away produced `GET /question/undefined` before the real
  // id arrived. Wait for `router.isReady` and pass a defined id only.
  const rawId = router.query?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const questionId = router.isReady && typeof id === "string" && id.length > 0 ? id : null;

  return (
    <Mainlayout>
      <div>
        <QuestionDetail questionId={questionId} />
      </div>
    </Mainlayout>
  );
};

export default index;
