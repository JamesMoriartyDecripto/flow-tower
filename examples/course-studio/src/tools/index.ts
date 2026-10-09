import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { lmsUpload } from './lms-upload';
import { renderMedia } from './media';
import { requestSignoff } from './request-signoff';
import { scormPackage } from './scorm-packager';
import { synthesizeVoice } from './tts';

/**
 * In-process MCP server. Tools are exposed to agents as mcp__studio__<name>, so agent
 * files can grant them one by one (least privilege):
 *   director        -> request_signoff
 *   media-producer  -> synthesize_voice, render_media
 *   course-packager -> scorm_package, lms_upload (sandbox + hidden course only)
 * Making a course visible is NOT a tool: only src/pipelines/publish.ts does it, after approval.
 */
export const studioServer = createSdkMcpServer({
  name: 'studio',
  version: '1.0.0',
  instructions: 'Syllabus Forge production tools. Every tool is idempotent for the same input hash.',
  tools: [scormPackage, lmsUpload, synthesizeVoice, renderMedia, requestSignoff],
});
