import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { validateOrganizationAccess, createSecureErrorResponse } from '../_shared/security.ts';
import { parseCSV } from './parsers/csvParser.ts';
import { parseTXT } from './parsers/txtParser.ts';
import { parsePDF } from './parsers/pdfParser.ts';
import { parseJSON } from './parsers/jsonParser.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

interface ProcessedFile {
  filename: string;
  type: string;
  size: number;
  entities: any[];
  summary: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
try {
    // Get auth header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: corsHeaders }
      );
    }

    // Create Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: corsHeaders }
      );
    }

    // Parse multipart form data
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    const userMessage = formData.get('message') as string || '';
    const organizationId = formData.get('organizationId') as string;
    const userId = formData.get('userId') as string;

    if (!organizationId || !userId) {
      return createSecureErrorResponse(
        new Error('Missing required fields'),
        'Organization ID and User ID are required',
        400
      );
    }

    // Validate organization access
    const hasAccess = await validateOrganizationAccess(supabase, userId, organizationId);
    if (!hasAccess) {
      return createSecureErrorResponse(
        new Error('Access denied'),
        'Access to organization denied',
        403
      );
    }

    if (files.length === 0) {
      return createSecureErrorResponse(
        new Error('No files provided'),
        'Please provide at least one file',
        400
      );
    }

    console.log(`Processing ${files.length} file(s) for user ${userId} in org ${organizationId}`);

    const processedFiles: ProcessedFile[] = [];
    const allEntities: any[] = [];
    let totalCreated = 0;
    let totalFailed = 0;

    // Process each file
    for (const file of files) {
      try {
        console.log(`Processing file: ${file.name} (${file.type}, ${file.size} bytes)`);

        // Upload file to storage
        const fileExt = file.name.split('.').pop()?.toLowerCase() || 'bin';
        const fileName = `${organizationId}/${Date.now()}_${file.name}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('crm-uploads')
          .upload(fileName, file, {
            contentType: file.type,
            upsert: false
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`);
        }

        // Create file record
        const { data: fileRecord, error: fileRecordError } = await supabase
          .from('uploaded_files')
          .insert({
            organization_id: organizationId,
            user_id: userId,
            filename: fileName,
            original_filename: file.name,
            file_type: fileExt,
            file_size: file.size,
            storage_path: uploadData.path,
            mime_type: file.type,
            processing_status: 'processing',
            processing_started_at: new Date().toISOString()
          })
          .select()
          .single();

        if (fileRecordError) {
          console.error('File record error:', fileRecordError);
          throw new Error(`Failed to create file record: ${fileRecordError.message}`);
        }

        // Parse file based on type
        const fileBuffer = await file.arrayBuffer();
        const fileContent = new TextDecoder().decode(fileBuffer);

        let parseResult;
        switch (fileExt) {
          case 'csv':
            parseResult = await parseCSV(fileContent, file.name);
            break;
          case 'txt':
            parseResult = await parseTXT(fileContent, file.name);
            break;
          case 'json':
            parseResult = await parseJSON(fileContent, file.name);
            break;
          case 'pdf':
            // For PDF, we'll need the binary data
            parseResult = await parsePDF(fileBuffer, file.name);
            break;
          default:
            // Try to parse as plain text
            parseResult = await parseTXT(fileContent, file.name);
        }

        console.log(`Parsed ${parseResult.entities.length} entities from ${file.name}`);

        // Store entities in database through CRM operations
        let created = 0;
        let failed = 0;

        for (const entity of parseResult.entities) {
          try {
            // Log extraction
            const { data: logEntry } = await supabase
              .from('file_extraction_log')
              .insert({
                uploaded_file_id: fileRecord.id,
                organization_id: organizationId,
                entity_type: entity.type,
                extracted_data: entity.data,
                status: 'pending',
                confidence_score: entity.confidence || 0.8
              })
              .select()
              .single();

            // Create entity via CRM operations function
            const createResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/crm-operations`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                operation: 'create',
                entity: entity.type,
                data: entity.data,
                organizationId,
                userId
              })
            });

            const createResult = await createResponse.json();

            if (createResponse.ok && createResult.success) {
              created++;
              // Update log entry with entity ID
              if (logEntry) {
                await supabase
                  .from('file_extraction_log')
                  .update({
                    status: 'created',
                    entity_id: createResult.data?.id
                  })
                  .eq('id', logEntry.id);
              }
            } else {
              failed++;
              // Update log entry with error
              if (logEntry) {
                await supabase
                  .from('file_extraction_log')
                  .update({
                    status: 'failed',
                    error_message: createResult.error || 'Unknown error'
                  })
                  .eq('id', logEntry.id);
              }
            }
          } catch (entityError) {
            console.error('Entity creation error:', entityError);
            failed++;
          }
        }

        totalCreated += created;
        totalFailed += failed;
        allEntities.push(...parseResult.entities);

        // Update file record with results
        await supabase
          .from('uploaded_files')
          .update({
            processing_status: failed > 0 && created === 0 ? 'failed' : failed > 0 ? 'partially_completed' : 'completed',
            processing_completed_at: new Date().toISOString(),
            extracted_data: parseResult.rawData || {},
            parsed_entities: parseResult.entities,
            entity_count: parseResult.entities.length,
            entities_created: created,
            entities_failed: failed,
            document_summary: parseResult.summary,
            searchable_content: parseResult.searchableText,
            confidence_score: parseResult.confidence || 0.8
          })
          .eq('id', fileRecord.id);

        processedFiles.push({
          filename: file.name,
          type: fileExt,
          size: file.size,
          entities: parseResult.entities,
          summary: parseResult.summary
        });

      } catch (fileError: any) {
        console.error(`Error processing file ${file.name}:`, fileError);
        totalFailed++;
        // Continue with other files
      }
    }

    // Generate intelligent summary
    const summary = generateSummary(processedFiles, totalCreated, totalFailed, userMessage);

    return new Response(
      JSON.stringify({
        success: true,
        message: summary,
        filesProcessed: processedFiles.length,
        entitiesCreated: totalCreated,
        entitiesFailed: totalFailed,
        files: processedFiles.map(f => ({
          name: f.filename,
          type: f.type,
          entityCount: f.entities.length,
          summary: f.summary
        }))
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error('File processing error:', error);
    return createSecureErrorResponse(error, 'File processing failed', 500);
  }
};

function generateSummary(files: ProcessedFile[], created: number, failed: number, userMessage: string): string {
  const totalEntities = files.reduce((sum, f) => sum + f.entities.length, 0);

  let summary = `✅ Successfully processed ${files.length} file(s)!\n\n`;

  if (created > 0) {
    summary += `📊 **Created ${created} new record(s)** in your CRM:\n`;

    // Group by entity type
    const entityCounts: { [key: string]: number } = {};
    files.forEach(f => {
      f.entities.forEach(e => {
        entityCounts[e.type] = (entityCounts[e.type] || 0) + 1;
      });
    });

    Object.entries(entityCounts).forEach(([type, count]) => {
      const icon = type === 'contact' ? '👤' : type === 'account' ? '🏢' : type === 'deal' ? '💰' : '📝';
      summary += `${icon} ${count} ${type}(s)\n`;
    });
  }

  if (failed > 0) {
    summary += `\n⚠️ ${failed} record(s) failed to import (duplicates or missing required fields)\n`;
  }

  summary += `\n📄 **Files processed:**\n`;
  files.forEach(f => {
    summary += `• ${f.filename} (${f.entities.length} entities found)\n`;
    if (f.summary) {
      summary += `  ${f.summary}\n`;
    }
  });

  if (userMessage) {
    summary += `\n💬 Your note: "${userMessage}"`;
  }

  summary += `\n\n✨ All data is now searchable! Try asking: "Show me the contacts I just imported" or "How many new accounts do I have?"`;

  return summary;
}

serve(handler);
