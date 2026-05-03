// supabase/functions/upload-to-drive/index.ts
// Uploads a PPTX file to user's Google Drive
// Accepts the file directly as base64 in the request body (no intermediate storage needed)

import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');

interface UploadRequest {
  fileName: string;
  fileBase64: string;
  presentationId?: string;
  // Legacy fields (kept for backward compat)
  storagePath?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
try {
    // Authenticate user
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized', errorCode: 'UNAUTHORIZED' }),
        { status: 401, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    const body: UploadRequest = await req.json();
    const { fileName, fileBase64, presentationId, storagePath } = body;

    if (!fileName) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing fileName' }),
        { status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    // Determine file source: direct base64 or legacy storage path
    let fileBuffer: ArrayBuffer;

    if (fileBase64) {
      // New path: decode base64 directly
      console.log(`[upload-to-drive] User ${user.id} uploading ${fileName} (direct, ${Math.round(fileBase64.length * 0.75 / 1024)}KB)`);
      const binaryStr = atob(fileBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      fileBuffer = bytes.buffer;
    } else if (storagePath) {
      // Legacy path: download from Supabase Storage
      console.log(`[upload-to-drive] User ${user.id} uploading ${fileName} from storage: ${storagePath}`);
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('generated-slides')
        .download(storagePath);

      if (downloadError || !fileData) {
        console.error('Storage download error:', downloadError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to retrieve file', errorCode: 'STORAGE_ERROR' }),
          { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } }
        );
      }
      fileBuffer = await fileData.arrayBuffer();
    } else {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing fileBase64 or storagePath' }),
        { status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    console.log(`[upload-to-drive] File size: ${fileBuffer.byteLength} bytes`);

    // Get user's Google refresh token
    const { data: tokenRow, error: tokenError } = await supabase
      .from('google_tokens')
      .select('refresh_token, scopes')
      .eq('user_id', user.id)
      .maybeSingle();

    if (tokenError) {
      console.error('Token fetch error:', tokenError);
      return new Response(
        JSON.stringify({ success: false, error: 'Database error', errorCode: 'DB_ERROR' }),
        { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    if (!tokenRow?.refresh_token) {
      console.log('No Google token found for user');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Google Drive not connected. Please connect your Google account.',
          errorCode: 'GOOGLE_NOT_CONNECTED' 
        }),
        { status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    // Check Drive scope
    const hasDriveScope = tokenRow.scopes?.includes('https://www.googleapis.com/auth/drive.file') ||
                          tokenRow.scopes?.includes('https://www.googleapis.com/auth/drive');
    if (!hasDriveScope) {
      console.log('Token missing drive scope, scopes:', tokenRow.scopes);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Google Drive access not granted. Please reconnect with Drive permissions.',
          errorCode: 'GOOGLE_SCOPE_MISSING' 
        }),
        { status: 403, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      console.error('Missing Google OAuth credentials');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Google integration not configured',
          errorCode: 'CONFIG_ERROR' 
        }),
        { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    // Exchange refresh token for access token
    console.log('[upload-to-drive] Refreshing access token...');
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: tokenRow.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenRes.ok) {
      const errorData = await tokenRes.text();
      console.error('Token refresh failed:', errorData);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Google session expired. Please reconnect your account.',
          errorCode: 'GOOGLE_TOKEN_EXPIRED' 
        }),
        { status: 401, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    const { access_token } = await tokenRes.json();
    console.log('[upload-to-drive] Access token obtained');

    // Upload to Google Drive using multipart upload
    const boundary = '-------' + Date.now().toString(36);
    const pptxMime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    
    const metadata = { name: fileName, mimeType: pptxMime };
    const metadataStr = JSON.stringify(metadata);

    const metadataPart = 
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataStr}\r\n`;
    const filePart = 
      `--${boundary}\r\nContent-Type: ${pptxMime}\r\n\r\n`;
    const endBoundary = `\r\n--${boundary}--`;

    const encoder = new TextEncoder();
    const metadataBytes = encoder.encode(metadataPart);
    const filePartBytes = encoder.encode(filePart);
    const endBytes = encoder.encode(endBoundary);

    const totalLength = metadataBytes.length + filePartBytes.length + fileBuffer.byteLength + endBytes.length;
    const driveBody = new Uint8Array(totalLength);
    let offset = 0;
    
    driveBody.set(metadataBytes, offset); offset += metadataBytes.length;
    driveBody.set(filePartBytes, offset); offset += filePartBytes.length;
    driveBody.set(new Uint8Array(fileBuffer), offset); offset += fileBuffer.byteLength;
    driveBody.set(endBytes, offset);

    console.log('[upload-to-drive] Uploading to Google Drive...');
    const driveRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: driveBody,
      }
    );

    if (!driveRes.ok) {
      const errorText = await driveRes.text();
      console.error('Drive upload failed:', driveRes.status, errorText);
      
      if (driveRes.status === 403) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Google Drive permission denied. Please reconnect with Drive access.',
            errorCode: 'GOOGLE_SCOPE_MISSING' 
          }),
          { status: 403, headers: { ...corsHeaders, 'content-type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to upload to Google Drive', errorCode: 'DRIVE_ERROR' }),
        { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    const driveFile = await driveRes.json();
    console.log('[upload-to-drive] Upload successful:', driveFile.id);

    return new Response(
      JSON.stringify({
        success: true,
        driveFileId: driveFile.id,
        driveUrl: driveFile.webViewLink,
        fileName: driveFile.name,
      }),
      { headers: { ...corsHeaders, 'content-type': 'application/json' } }
    );

  } catch (err) {
    console.error('[upload-to-drive] Unexpected error:', err);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error', errorCode: 'INTERNAL_ERROR' }),
      { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } }
    );
  }
});
