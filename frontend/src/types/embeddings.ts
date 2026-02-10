// TypeScript interfaces for the Embeddings module

export interface EmbeddingConfig {
  id: number;
  name: string;
  strategy: string;
  is_active: boolean;
  window_seconds: number;
  window_overlap_seconds: number;
  min_snapshots: number;
  phases: number[] | null;
  normalization: string;
  model_path: string | null;
  metadata: Record<string, unknown> | null;
  total_embeddings: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmbeddingRecord {
  id: number;
  mint: string;
  window_start: string;
  window_end: string;
  phase_id_at_time: number | null;
  label: string | null;
  num_snapshots: number;
  strategy: string;
  config_id: number | null;
  quality_score: number | null;
  created_at: string;
}

export interface SimilarityResult {
  id: number;
  mint: string;
  window_start: string;
  window_end: string;
  phase_id: number | null;
  label: string | null;
  similarity: number;
  strategy: string;
  created_at: string;
}

export interface SimilaritySearchResponse {
  query_mint: string | null;
  results: SimilarityResult[];
  total_results: number;
  search_time_ms: number;
}

export interface EmbeddingJob {
  id: number;
  config_id: number;
  job_type: string;
  status: string;
  process_start: string;
  process_end: string;
  embeddings_created: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface LabelStat {
  label: string;
  count: number;
  sources: Record<string, number>;
}

export interface EmbeddingStats {
  total_embeddings: number;
  total_labeled: number;
  total_configs: number;
  active_configs: number;
  embeddings_by_strategy: Record<string, number>;
  embeddings_by_label: Record<string, number>;
  embeddings_by_phase: Record<string, number>;
  storage_size_mb: number;
}

export interface EmbeddingHealth {
  status: string;
  service_running: boolean;
  active_configs: number;
  last_run: string | null;
  total_embeddings: number;
  stats: Record<string, unknown>;
}

export interface ClusterResult {
  cluster_id: number;
  size: number;
  label_distribution: Record<string, number>;
  sample_mints: string[];
}

export interface ClusterAnalysis {
  k: number;
  total_embeddings: number;
  clusters: ClusterResult[];
  inertia: number;
}

export interface Neo4jSyncStatus {
  total_pairs: number;
  synced: number;
  pending: number;
}
