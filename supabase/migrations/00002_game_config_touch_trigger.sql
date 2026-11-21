create trigger game_config_touch_updated_at
before update on public.game_config
for each row execute function public.touch_updated_at();