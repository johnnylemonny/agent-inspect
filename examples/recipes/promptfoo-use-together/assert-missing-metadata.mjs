/**
 * Control assertion: call trajectory assert with empty metadata (must fail closed).
 */
import assertTrajectory from "./assert-trajectory.mjs";

export default async function assertMissingMetadata(output, context) {
  return assertTrajectory(output, {
    ...context,
    providerResponse: { metadata: {} },
    metadata: {},
  });
}
