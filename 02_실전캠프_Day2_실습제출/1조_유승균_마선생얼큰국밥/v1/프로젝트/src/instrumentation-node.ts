import { startCloudPoller } from "./lib/crawler/poller";
import { isCloudRuntime } from "./lib/runtime";

if (!isCloudRuntime()) startCloudPoller();
