import Markdown from "react-markdown";

export function MentorText({ children }: { children: string }) {
  return <div className="mentor-text"><Markdown skipHtml disallowedElements={["img"]}>{children}</Markdown></div>;
}
