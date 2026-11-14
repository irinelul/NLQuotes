import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import quoteModel, { getPoolForTenant } from './postgres.js';
import { applyV2DatabaseSuffix, getTenantById } from '../tenants/tenant-manager.js';

describe('quoteModel v2 normalized videos + quotes queries', () => {
  let pool;
  let mockClient;
  let connectSpy;
  let poolQuerySpy;

  beforeEach(() => {
    pool = getPoolForTenant(null);
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    connectSpy = vi.spyOn(pool, 'connect').mockResolvedValue(mockClient);
    poolQuerySpy = vi.spyOn(pool, 'query');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getGameList queries the normalized videos table instead of quotes', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ game_name: 'Balatro' }, { game_name: 'Slay the Spire' }],
    });

    const games = await quoteModel.getGameList();

    expect(games).toEqual(['Balatro', 'Slay the Spire']);
    expect(mockClient.query).toHaveBeenCalledTimes(1);
    const [sql] = mockClient.query.mock.calls[0];
    expect(sql).toContain('SELECT DISTINCT game_name');
    expect(sql).toContain('FROM videos');
    expect(sql).not.toContain('FROM quotes');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('getLatestUploadDate queries max(upload_date) from videos', async () => {
    poolQuerySpy.mockResolvedValueOnce({
      rows: [{ latest: '2026-10-17' }],
    });

    const latest = await quoteModel.getLatestUploadDate();

    expect(latest).toBe('2026-10-17');
    expect(poolQuerySpy).toHaveBeenCalledWith('SELECT max(upload_date) AS latest FROM videos');
  });

  it('listVideosForIndex queries videos directly using quote_count and upload_date', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          video_id: 'abc123def45',
          title: 'Episode 1',
          game_name: 'Balatro',
          upload_date: '2026-10-15',
          quote_count: '420',
        },
      ],
    });

    const rows = await quoteModel.listVideosForIndex({ minQuotes: 20, since: '2026-01-01', limit: 100 });

    expect(rows).toEqual([
      {
        videoId: 'abc123def45',
        title: 'Episode 1',
        gameName: 'Balatro',
        uploadDate: '2026-10-15',
        quoteCount: 420,
      },
    ]);
    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).toContain('FROM videos v');
    expect(sql).toContain('WHERE v.quote_count >= $1');
    expect(sql).not.toContain('FROM quotes');
    expect(params).toEqual([20, '2026-01-01']);
  });

  it('getVideo joins videos and quotes and automatically falls back on 42703 column mismatch', async () => {
    const colError = new Error('column q.timestamp_start does not exist');
    colError.code = '42703';
    mockClient.query
      .mockRejectedValueOnce(colError)
      .mockResolvedValueOnce({
        rows: [
          {
            video_id: 'abc123def45',
            title: 'Test Video',
            channel_source: 'Northernlion',
            upload_date: '2026-10-15',
            game_name: 'Balatro',
            total_quotes: '2',
            quotes: [{ text: 'hello world', line_number: 1, timestamp_start: 12.5, timestamp_start_seconds: 12.5 }],
          },
        ],
      });

    const video = await quoteModel.getVideo('abc123def45');

    expect(video.total_quotes).toBe(2);
    expect(mockClient.query).toHaveBeenCalledTimes(2);
    const [retrySql] = mockClient.query.mock.calls[1];
    expect(retrySql).toContain('FROM videos v');
    expect(retrySql).toContain('JOIN quotes q ON q.video_id = v.video_id');
    expect(retrySql).toContain('q.start_s');
  });

  it('search uses fast videos-only page CTE when browsing by game without a searchTerm', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          video_id: 'abc123def45',
          title: 'Isaac Ep 1',
          upload_date: '2026-05-01',
          channel_source: 'Northernlion',
          total_videos: '10',
          total_quotes: '5000',
          quotes: [],
        },
      ],
    });

    const res = await quoteModel.search({
      searchTerm: '',
      gameName: 'The Binding of Isaac: Rebirth',
      selectedValue: 'northernlion',
      year: '2026',
      sortOrder: 'newest',
      page: 1,
      limit: 10,
    });

    expect(res.total).toBe(10);
    expect(res.totalQuotes).toBe(5000);
    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).toContain('SUM(v.quote_count) OVER () AS total_quotes');
    expect(sql).toContain('FROM videos v');
    expect(sql).toContain('WHERE v.quote_count > 0 AND v.game_name = $1 AND v.channel_source = $2');
    expect(params).toEqual([
      'The Binding of Isaac: Rebirth',
      'Northernlion',
      '2026-01-01',
      '2027-01-01',
      10,
      0,
    ]);
  });

  it('search resolves tenant channel dbValue for vinesauce and hivemind and uses phraseto_tsquery when exactPhrase is true', async () => {
    const vinesauceTenant = getTenantById('vinesauce');
    const vinesaucePool = {
      connect: vi.fn().mockResolvedValue(mockClient),
    };
    connectSpy.mockRestore();
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    // Temporarily set env var so tenant pool resolves
    process.env.DATABASE_URL_VINESAUCE = 'postgresql://localhost:5432/vinesauce_v2';
    const tenantPool = getPoolForTenant(vinesauceTenant);
    vi.spyOn(tenantPool, 'connect').mockResolvedValue(mockClient);

    await quoteModel.search({
      searchTerm: 'speen moment',
      gameName: 'all',
      selectedValue: 'VINESAUCEfull',
      year: '',
      sortOrder: 'default',
      page: 1,
      limit: 10,
      exactPhrase: true,
      tenant: vinesauceTenant,
    });

    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).toContain("q.fts_doc @@ phraseto_tsquery('simple', $1)");
    expect(sql).toContain('v.channel_source = $2');
    expect(sql).toContain('q.start_s');
    expect(sql).toContain('DISTINCT ON (h.video_id, h.run)');
    expect(sql).toContain('ORDER BY h.video_id, h.run, h.in_line DESC, h.line_number');
    expect(sql).toContain("COALESCE(h.text || ' ' || nq.text, h.text)");
    expect(params).toEqual(['speen moment', 'vinesaucefull', 10, 0]);
    expect(vinesaucePool).toBeDefined();
  });

  it('search recounts deduplicated v2 window hits when offset > 0 returns an empty page', async () => {
    const vinesauceTenant = getTenantById('vinesauce');
    connectSpy.mockRestore();
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total_videos: '3', total_quotes: '7' }] });

    process.env.DATABASE_URL_VINESAUCE = 'postgresql://localhost:5432/vinesauce_v2';
    const tenantPool = getPoolForTenant(vinesauceTenant);
    vi.spyOn(tenantPool, 'connect').mockResolvedValue(mockClient);

    const res = await quoteModel.search({
      searchTerm: 'cucumber motherfucker',
      gameName: 'all',
      selectedValue: 'all',
      year: '',
      sortOrder: 'newest',
      page: 5,
      limit: 10,
      exactPhrase: true,
      tenant: vinesauceTenant,
    });

    expect(res).toEqual({ data: [], total: 3, totalQuotes: 7, queryTime: null });
    expect(mockClient.query).toHaveBeenCalledTimes(2);
    const [countSql, countParams] = mockClient.query.mock.calls[1];
    expect(countSql).toContain('DISTINCT ON (h.video_id, h.run)');
    expect(countParams).toEqual(['cucumber motherfucker']);
  });

  it('applyV2DatabaseSuffix appends _v2 only when USE_V2_DB=true and not already _v2', () => {
    const prev = process.env.USE_V2_DB;
    try {
      delete process.env.USE_V2_DB;
      expect(applyV2DatabaseSuffix('postgresql://user:pass@host:5432/quotes')).toBe(
        'postgresql://user:pass@host:5432/quotes'
      );

      process.env.USE_V2_DB = 'true';
      expect(applyV2DatabaseSuffix('postgresql://user:pass@host:5432/quotes')).toBe(
        'postgresql://user:pass@host:5432/quotes_v2'
      );
      expect(applyV2DatabaseSuffix('postgresql://user:pass@host:5432/quotes_v2')).toBe(
        'postgresql://user:pass@host:5432/quotes_v2'
      );
    } finally {
      if (prev === undefined) delete process.env.USE_V2_DB;
      else process.env.USE_V2_DB = prev;
    }
  });
});
