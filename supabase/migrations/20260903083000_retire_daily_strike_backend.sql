begin;

-- AR15: retire Daily Strike after the Arcade Rush production cutover.
-- Preserve the board row and historical submissions for audit/rollback history,
-- but make the board unreachable through active leaderboard RPCs.
update public.leaderboard_boards
set is_active = false,
    is_visible = false
where board_key = 'daily-strike-v1';

create or replace function public.submit_leaderboard_result(
    p_user_id uuid,
    p_board_key text,
    p_session_id text,
    p_client_version text,
    p_score bigint,
    p_stage integer,
    p_level integer,
    p_grade text,
    p_wpm numeric,
    p_raw_wpm numeric,
    p_accuracy numeric,
    p_duration_ms bigint,
    p_completed boolean,
    p_words_completed integer,
    p_integrity_remaining integer,
    p_challenge_date date,
    p_challenge_version integer,
    p_metrics jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    selected_board public.leaderboard_boards%rowtype;
    existing_id uuid;
    inserted_id uuid;
    recent_count integer;
begin
    perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

    if not exists (select 1 from public.leaderboard_profiles where user_id = p_user_id) then
        return jsonb_build_object('ok', false, 'code', 'PROFILE_REQUIRED');
    end if;

    select * into selected_board
    from public.leaderboard_boards
    where board_key = p_board_key
      and board_key in (
          'campaign-highest-level-v1',
          'typing-60s-english200-v1',
          'typing-15s-english200-v1',
          'endless-v1',
          'arcade-rush-v1'
      )
      and is_active = true
      and is_visible = true;

    if not found then
        return jsonb_build_object('ok', false, 'code', 'BOARD_UNAVAILABLE');
    end if;

    select id into existing_id
    from public.leaderboard_submissions
    where user_id = p_user_id and board_key = p_board_key and session_id = p_session_id;

    if existing_id is not null then
        return jsonb_build_object('ok', true, 'duplicate', true, 'submission_id', existing_id,
                                  'rules_version', selected_board.rules_version);
    end if;

    select count(*) into recent_count
    from public.leaderboard_submissions
    where user_id = p_user_id
      and moderation_status = 'accepted'
      and submitted_at >= now() - interval '1 hour';

    if recent_count >= 30 then
        return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED');
    end if;

    insert into public.leaderboard_submissions (
        user_id, board_key, rules_version, session_id, client_version,
        score, stage, level, grade, wpm, raw_wpm, accuracy, duration_ms,
        completed, words_completed, integrity_remaining, challenge_date,
        challenge_version, metrics, moderation_status
    ) values (
        p_user_id, selected_board.board_key, selected_board.rules_version,
        p_session_id, p_client_version, p_score, p_stage, p_level, p_grade,
        p_wpm, p_raw_wpm, p_accuracy, p_duration_ms, p_completed,
        p_words_completed, p_integrity_remaining, p_challenge_date,
        p_challenge_version, p_metrics, 'accepted'
    )
    on conflict (user_id, board_key, session_id) do nothing
    returning id into inserted_id;

    if inserted_id is null then
        select id into existing_id
        from public.leaderboard_submissions
        where user_id = p_user_id and board_key = p_board_key and session_id = p_session_id;
        return jsonb_build_object('ok', true, 'duplicate', true, 'submission_id', existing_id,
                                  'rules_version', selected_board.rules_version);
    end if;

    return jsonb_build_object('ok', true, 'duplicate', false, 'submission_id', inserted_id,
                              'rules_version', selected_board.rules_version);
end;
$$;

revoke all on function public.submit_leaderboard_result(
    uuid, text, text, text, bigint, integer, integer, text, numeric, numeric,
    numeric, bigint, boolean, integer, integer, date, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.submit_leaderboard_result(
    uuid, text, text, text, bigint, integer, integer, text, numeric, numeric,
    numeric, bigint, boolean, integer, integer, date, integer, jsonb
) to service_role;

create or replace function public.get_public_leaderboard(
    p_board_key text,
    p_challenge_date date default null,
    p_viewer_user_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    selected_board public.leaderboard_boards%rowtype;
    result jsonb;
begin
    select * into selected_board
    from public.leaderboard_boards
    where board_key = p_board_key
      and board_key in (
          'campaign-highest-level-v1',
          'typing-60s-english200-v1',
          'typing-15s-english200-v1',
          'endless-v1',
          'arcade-rush-v1'
      )
      and is_active = true
      and is_visible = true;

    if not found then return null; end if;

    with eligible as (
        select s.id, s.user_id, p.username, s.completed, s.score, s.stage,
               s.level, s.grade, s.wpm, s.raw_wpm, s.accuracy, s.duration_ms,
               s.words_completed, s.submitted_at
        from public.leaderboard_submissions s
        join public.leaderboard_profiles p on p.user_id = s.user_id
        where s.board_key = selected_board.board_key
          and s.rules_version = selected_board.rules_version
          and s.moderation_status = 'accepted'
          and p.username ~ '^[A-Za-z0-9_]{3,20}$'
          and (selected_board.board_key <> 'campaign-highest-level-v1' or s.completed = true)
          and (selected_board.board_key not like 'typing-%' or s.completed = true)
          and (selected_board.board_key <> 'arcade-rush-v1' or s.completed = true)
    ),
    player_best as (
        select * from (
            select eligible.*,
                row_number() over (
                    partition by user_id
                    order by
                        case when selected_board.board_key = 'arcade-rush-v1' then score end desc nulls last,
                        case when selected_board.board_key = 'arcade-rush-v1' then accuracy end desc nulls last,
                        case when selected_board.board_key = 'arcade-rush-v1' then duration_ms end asc nulls last,
                        case when selected_board.board_key = 'endless-v1' then stage end desc nulls last,
                        case when selected_board.board_key = 'endless-v1' then score end desc nulls last,
                        case when selected_board.board_key = 'endless-v1' then words_completed end desc nulls last,
                        case when selected_board.board_key = 'endless-v1' then accuracy end desc nulls last,
                        case when selected_board.board_key = 'campaign-highest-level-v1' then level end desc nulls last,
                        case when selected_board.board_key = 'campaign-highest-level-v1' then
                            case grade when 'S' then 5 when 'A' then 4 when 'B' then 3 when 'C' then 2 when 'D' then 1 else 0 end
                        end desc nulls last,
                        case when selected_board.board_key = 'campaign-highest-level-v1' then accuracy end desc nulls last,
                        case when selected_board.board_key like 'typing-%' then wpm end desc nulls last,
                        case when selected_board.board_key like 'typing-%' then accuracy end desc nulls last,
                        case when selected_board.board_key like 'typing-%' then raw_wpm end desc nulls last,
                        submitted_at asc, id asc
                ) as best_order
            from eligible
        ) ordered where best_order = 1
    ),
    ranked as (
        select player_best.*,
            row_number() over (
                order by
                    case when selected_board.board_key = 'arcade-rush-v1' then score end desc nulls last,
                    case when selected_board.board_key = 'arcade-rush-v1' then accuracy end desc nulls last,
                    case when selected_board.board_key = 'arcade-rush-v1' then duration_ms end asc nulls last,
                    case when selected_board.board_key = 'endless-v1' then stage end desc nulls last,
                    case when selected_board.board_key = 'endless-v1' then score end desc nulls last,
                    case when selected_board.board_key = 'endless-v1' then words_completed end desc nulls last,
                    case when selected_board.board_key = 'endless-v1' then accuracy end desc nulls last,
                    case when selected_board.board_key = 'campaign-highest-level-v1' then level end desc nulls last,
                    case when selected_board.board_key = 'campaign-highest-level-v1' then
                        case grade when 'S' then 5 when 'A' then 4 when 'B' then 3 when 'C' then 2 when 'D' then 1 else 0 end
                    end desc nulls last,
                    case when selected_board.board_key = 'campaign-highest-level-v1' then accuracy end desc nulls last,
                    case when selected_board.board_key like 'typing-%' then wpm end desc nulls last,
                    case when selected_board.board_key like 'typing-%' then accuracy end desc nulls last,
                    case when selected_board.board_key like 'typing-%' then raw_wpm end desc nulls last,
                    submitted_at asc, id asc
            ) as rank
        from player_best
    )
    select jsonb_build_object(
        'board', jsonb_build_object(
            'boardKey', selected_board.board_key,
            'displayName', selected_board.display_name,
            'rulesVersion', selected_board.rules_version,
            'challengeDate', null
        ),
        'entries', coalesce((
            select jsonb_agg((
                jsonb_build_object('rank', rank, 'username', username,
                                   'accuracy', accuracy, 'submittedAt', submitted_at)
                || case
                    when selected_board.board_key = 'campaign-highest-level-v1'
                        then jsonb_build_object('level', level, 'grade', grade)
                    when selected_board.board_key like 'typing-%'
                        then jsonb_build_object('wpm', wpm, 'rawWpm', raw_wpm)
                    when selected_board.board_key = 'endless-v1'
                        then jsonb_build_object('stage', stage, 'score', score)
                    else jsonb_build_object('score', score, 'durationMs', duration_ms,
                                            'completed', completed)
                end
            ) order by rank) from ranked where rank <= 100
        ), '[]'::jsonb),
        'viewer', (
            select jsonb_build_object(
                'rank', rank,
                'entry', jsonb_build_object('rank', rank, 'username', username,
                                            'accuracy', accuracy, 'submittedAt', submitted_at)
                    || case
                        when selected_board.board_key = 'campaign-highest-level-v1'
                            then jsonb_build_object('level', level, 'grade', grade)
                        when selected_board.board_key like 'typing-%'
                            then jsonb_build_object('wpm', wpm, 'rawWpm', raw_wpm)
                        when selected_board.board_key = 'endless-v1'
                            then jsonb_build_object('stage', stage, 'score', score)
                        else jsonb_build_object('score', score, 'durationMs', duration_ms,
                                                'completed', completed)
                    end
            ) from ranked where user_id = p_viewer_user_id
        )
    ) into result;
    return result;
end;
$$;

revoke all on function public.get_public_leaderboard(text, date, uuid)
from public, anon, authenticated;
grant execute on function public.get_public_leaderboard(text, date, uuid)
to service_role;

commit;
