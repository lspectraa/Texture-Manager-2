import common from "./common";
import errors from "./errors";
import iconEditor from "./iconEditor";
import navigation from "./navigation";
import onboarding from "./onboarding";
import reports from "./reports";
import settings from "./settings";
import tools from "./tools";

const en = {
  common,
  navigation,
  onboarding,
  settings,
  tools,
  iconEditor,
  reports,
  errors,
} as const;

export default en;

export type EnglishResources = typeof en;
