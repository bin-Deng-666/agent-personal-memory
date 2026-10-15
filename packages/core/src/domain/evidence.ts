import type { Proposal } from "./memory.ts";

/** Conservative checks supplement model judgment; they do not establish full semantic fidelity. */
export function validatePersonalEvidence(proposal: Proposal) {
  if (proposal.action === "delete" || !proposal.sources.length) return;
  const evidence = proposal.sources.map((source) => source.quote).join("\n");
  const summary = `${proposal.title}\n${proposal.content}\n${proposal.scope}`;
  const identifiers =
    summary.match(
      /\b(?:https?:\/\/)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[a-z0-9_./?=%&#-]*)?/gi,
    ) || [];
  for (const identifier of identifiers) {
    const plain = identifier
      .replace(/^https?:\/\//i, "")
      .replace(/\/$/, "")
      .toLowerCase();
    if (!evidence.toLowerCase().includes(plain))
      throw new Error(
        "The summary names a service/domain not present in its quoted user evidence; remove the unsupported detail or supply the actual user quote",
      );
  }
  const projectSpecific =
    /(?:这个|本次|本|该|当前|咱们的|我们的).{0,6}(?:项目|仓库|插件|页面|功能|任务|安装包|readme)|(?:readme|安装包|界面|页面|按钮|文件树|仓库).{0,18}(?:改|增加|显示|支持|安装|命名|间距|更新)|\b(?:this|current|our)\s+(?:project|repository|repo|plugin|page|task|readme)\b/iu.test(
      evidence,
    );
  const personalContext =
    /长期|一直|职业|家庭|工作环境|亲身|经历|当时.{0,8}(?:感到|觉得)|焦虑|挫败|难过|自豪|担心|认真(?:考虑|探索)|每周|每年|沟通习惯|合作习惯|\b(?:career|family|i felt|i experienced|long.term|every week|communication habit)\b/iu.test(
      evidence,
    );
  const personality =
    /谨慎程度|考虑全面|性格.{0,6}(?:谨慎|理性|焦虑)|追求完美|完美主义|害怕失败|抗压能力|风险厌恶|\b(?:perfectionist|risk.averse|personality|fears? failure)\b/iu;
  if (personality.test(summary) && !personality.test(evidence))
    throw new Error(
      "A situational request cannot support a broad personality, motive or character judgment; retain only directly supported personal facts",
    );
  const transientObservation =
    /有时(?:候)?.{0,12}(?:连得上|连不上|连接|网络)|这次.{0,12}(?:报错|连接失败|超时)|\b(?:sometimes connects|intermittent connection|this timeout)\b/iu.test(
      evidence,
    );
  if (proposal.type === "个人背景" && transientObservation && !personalContext)
    throw new Error(
      "A troubleshooting observation does not establish an ongoing personal background; skip it unless the user states a lasting condition",
    );
  if (projectSpecific && !personalContext)
    throw new Error(
      "This evidence is a project-specific requirement or task detail, without reusable personal context; do not save it as a personal memory",
    );
}
