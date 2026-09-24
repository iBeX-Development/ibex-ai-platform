import { z } from 'zod';

export const featureControlsSchema = z
  .object({
    aiPlatform: z.boolean(),
    agents: z.boolean(),
    generalAgent: z.boolean(),
    maintenanceAgent: z.boolean(),
    assetAgent: z.boolean(),
    warehouseAgent: z.boolean(),
    rag: z.boolean(),
    tools: z.boolean(),
    actionTools: z.boolean(),
    modelGateway: z.boolean(),
    modelFallback: z.boolean()
  })
  .strict()
  .readonly();

export type FeatureControls = Readonly<z.infer<typeof featureControlsSchema>>;

export function featureControls(input: FeatureControls): FeatureControls {
  return Object.freeze(featureControlsSchema.parse(input));
}

export function agentFeatureEnabled(controls: FeatureControls, agentId: string): boolean {
  const enabled: Readonly<Record<string, boolean>> = {
    general_ibex: controls.generalAgent,
    'maintenance-agent': controls.maintenanceAgent,
    asset: controls.assetAgent,
    warehouse: controls.warehouseAgent
  };
  return enabled[agentId] === true;
}
