import os
import re
import click
import json
import shutil
import urllib
import string
import secrets
import tempfile
import fabrica

from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, Tuple, List, Union
from data_layer import ResourceLocator, locator_factory, Decryptor
from moda import process, log
from moda.user import UserInteractor
from moda.command import invoke_subcommand
from moda.style import Format
from data_layer import Mongo as SQL
from fabrica import run as run_fabrica
from io_map import io_pruned_structure

class DataDragon:
  previous_version = '0.6'
  current_version = '0.7'
  configuration: Dict[str, any]
  environment: Dict[str, any]
  use_the_force: bool
  user: UserInteractor

  def __init__(self, environment_name: str, use_the_force: bool):
    self.use_the_force = use_the_force
    configuration_path = Path(__file__).parent.parent / 'configure.json'
    with open(configuration_path) as f:
      self.configuration = json.load(f)
    environment_path = Path(__file__).parent.parent / 'environment' / f'environment.{environment_name}.json'
    with open(environment_path) as f:
      self.environment = json.load(f)
    self.user = UserInteractor(
      interactive=not self.use_the_force,
      timeout=None
    )

  def configure_aliases(self):
    for alias, url in self.configuration['aliases'].items():
      ResourceLocator.register_url(
        alias=alias,
        url=url
      )

  def configure_encryption(self):
    for name, private_key_url in self.configuration['encrypt'].items():
      locator = locator_factory(url=private_key_url)
      private_key_bytes = locator.get()
      password = locator.get_locator_parameter(parameter='password')
      decryptor = Decryptor(
        private_key=private_key_bytes,
        password=password.encode(),
        name=name
      )
      Decryptor.register_decryptor(decryptor=decryptor)

  def configure_output(self):
    os.chmod(str(Path(__file__).parent.parent / 'output'), 0o700)

  def configure_fabrica(self):
    fabrica_config_path = Path(__file__).parent.parent / 'output' / 'temp' / 'fabrica.json'
    fabrica_config = self.environment['databases']
    with open(fabrica_config_path, 'w') as f:
      json.dump(fabrica_config, f)
    os.environ['FABRICA_SQL_CONFIG_PATH'] = str(fabrica_config_path)

  def run_local_process(self, run_args: List[str], confirm: bool=True, capture_output: bool=False, check_completed: bool=True, shell: bool=False) -> Optional[Tuple[int, Optional[bytes], Optional[bytes]]]:
    process_description = " ".join(process.escape_run_args(run_args))
    if confirm and not self.user.present_confirmation(
      f'Run {process_description}',
      default_response=self.use_the_force
    ):
      return None

    if capture_output:
      result = process.run_process_output(run_args=run_args, shell=shell)
    else:
      result = (process.call_process(run_args=run_args, shell=shell), None, None)

    if check_completed and result[0] != 0:
      raise click.ClickException(f'Process returned a non-zero exit code {result[0]}:\n{process_description}')
    return result

  def run_remote_process(self, run_args: List[str], remote_url: str, confirm: bool=True, capture_output: bool=False, check_completed: bool=True, shell: bool=False) -> Optional[Tuple[int, Optional[bytes], Optional[bytes]]]:
    dealiased_url = ResourceLocator.dealias_url(url=remote_url)
    if ResourceLocator.get_url_parts(url=dealiased_url).scheme in ['', 'file']:
      return self.run_local_process(
        run_args=run_args,
        confirm=confirm,
        capture_output=capture_output,
        check_completed=check_completed,
        shell=shell
      )

    remote_run_args = process.ssh_command(
      run_args=run_args,
      user=ResourceLocator.get_url_parts(url=dealiased_url).username,
      host=ResourceLocator.get_url_parts(url=dealiased_url).hostname,
      escape_run_args=not shell
    )
    return self.run_local_process(
      run_args=remote_run_args,
      confirm=confirm,
      capture_output=capture_output,
      check_completed=check_completed
    )

  def remote_data_dragon_path(self, remote_url: str) -> str:
    dealiased_url = ResourceLocator.dealias_url(url=remote_url)
    parts = ResourceLocator.get_url_parts(url=ResourceLocator.join_path(
      url=dealiased_url,
      path='datadragon.sh',
    ))
    data_dragon_path = parts.path[1:] if parts.scheme else f'./{parts.path}' if '/' not in parts.path else parts.path
    return data_dragon_path

  def remote_url_is_this_instance(self, remote_url: str) -> bool:
    dealiased_url = ResourceLocator.dealias_url(url=remote_url)
    return dealiased_url == './'

  def generate_password(self, length: int=7, characters: str=string.ascii_lowercase + string.digits) -> str:
    password = ''.join(secrets.choice(characters) for _ in range(length))
    return password

pass_data_dragon = click.make_pass_decorator(DataDragon)

@click.group()
@click.option('-e', '--environment', 'environment_name', default='default')
@click.option('--use-the-force', is_flag=True)
@click.pass_context
def run(ctx: any, environment_name: str, use_the_force: bool):
  data_dragon = DataDragon(
    environment_name=environment_name,
    use_the_force=use_the_force
  )
  data_dragon.configure_aliases()
  data_dragon.configure_output()
  data_dragon.configure_fabrica()
  ctx.obj = data_dragon

@run.command()
@click.argument('remote_url')
@click.argument('remote_command', nargs=-1)
@click.pass_obj
def remote(data_dragon: DataDragon, remote_url: str, remote_command: Tuple[str], _confirm: bool=True, _capture_output: bool=False, _check_completed: bool=True):
  data_dragon_path = data_dragon.remote_data_dragon_path(remote_url=remote_url)
  run_args = [
    data_dragon_path,
    *(['--use-the-force'] if data_dragon.use_the_force else []),
    *remote_command,
  ]
  result = data_dragon.run_remote_process(
    run_args=run_args,
    remote_url=remote_url,
    confirm=_confirm,
    capture_output=_capture_output,
    check_completed=_check_completed
  )
  return result

class FilesContext:
  data_dragon: DataDragon
  suffix: str

  def __init__(self, data_dragon: DataDragon, suffix: str):
    self.data_dragon = data_dragon
    self.suffix = suffix

  @property
  def files_path(self) -> Path:
    return Path(__file__).parent.parent / 'output' / 'files' / f'files{self.suffix}'

  @property
  def source_files_path(self) -> Path:
    return Path(__file__).parent.parent / 'files'

@run.group(name='files')
@click.option('-s', '--suffix', 'suffix')
@click.pass_obj
@click.pass_context
@invoke_subcommand()
def files(ctx: any, data_dragon: DataDragon, suffix: Optional[str]):
  ctx.obj = FilesContext(
    data_dragon = data_dragon,
    suffix=f'-{suffix}' if suffix else ''
  )

@files.command(name='dump')
@click.pass_obj
@pass_data_dragon
@click.pass_context
def files_dump(ctx: any, data_dragon: DataDragon, files_context: FilesContext):
  ctx.invoke(
    files_purge
  )
  shutil.copytree(str(files_context.source_files_path), str(files_context.files_path))

@files.command(name='restore')
@click.pass_obj
@pass_data_dragon
def files_restore(data_dragon: DataDragon, files_context: FilesContext):
  assert files_context.files_path.exists()
  if not data_dragon.user.present_confirmation(f'Remove files/ directory and replace it with dumped files at\n{files_context.files_path}', default_response=data_dragon.use_the_force):
    return
  if files_context.source_files_path.exists():
    shutil.rmtree(str(files_context.source_files_path))
  shutil.copytree(str(files_context.files_path), str(files_context.source_files_path))

@files.command(name='pull')
@click.argument('remote_url')
@click.pass_obj
@click.pass_context
def files_pull(ctx: any, files_context: FilesContext, remote_url: str):
  temp_dir_path = Path(__file__).parent.parent / 'output' / 'temp'
  data_url = ResourceLocator.merge_urls(
    base_url=remote_url,
    url=ResourceLocator.append_locator_parameters(
      url=f'/output/files/files{files_context.suffix}/',
      parameters={
        'dir': str(temp_dir_path),
        'verbose': '1',
      }
    )
  )
  data_locator = locator_factory(url=data_url)
  temp_data_path = Path(data_locator.get())
  ctx.invoke(
    files_purge
  )
  shutil.move(str(temp_data_path), str(files_context.files_path))
  shutil.rmtree(str(temp_data_path.parent))

@files.command(name='purge')
@click.pass_obj
def files_purge(files_context: FilesContext):
  if files_context.files_path.exists():
    shutil.rmtree(str(files_context.files_path))

@files.command(name='push')
@click.argument('remote_url')
@click.pass_obj
def files_push(files_context: FilesContext, remote_url: str):
  data_url = ResourceLocator.merge_urls(
    base_url=remote_url,
    url=f'/output/files/files{files_context.suffix}/?locator=1&verbose=1',
  )
  data_locator = locator_factory(url=data_url)
  data_locator.put(resource=os.path.join(str(files_context.files_path), ''))

@files.command(name='migrate')
@click.option('--from', 'from_version', default=DataDragon.previous_version)
@click.option('--to', 'to_version', default=DataDragon.current_version)
@click.pass_obj
@pass_data_dragon
def files_migrate(data_dragon: DataDragon, files_context: FilesContext, from_version: str, to_version: str):
  pass

class DataContext:
  data_dragon: DataDragon
  suffix: str
  data_path: Path

  def __init__(self, data_dragon: DataDragon, suffix: str):
    self.data_dragon = data_dragon
    self.suffix = suffix
    self.data_path = Path(__file__).parent.parent / 'output' / 'data' / f"{self.data_dragon.environment['databases']['default']['database']}{self.suffix}"

  def configure_database(self):
    SQL.Layer.configure_connection(self.data_dragon.environment['databases']['default'])

@run.group(name='data')
@click.option('-s', '--suffix', 'suffix')
@click.pass_obj
@click.pass_context
@invoke_subcommand()
def data(ctx: any, data_dragon: DataDragon, suffix: Optional[str]):
  data_context = DataContext(
    data_dragon=data_dragon,
    suffix=f'-{suffix}' if suffix else ''
  )
  data_context.configure_database()
  ctx.obj = data_context

@data.command()
@click.pass_obj
@pass_data_dragon
@click.pass_context
def dump(ctx: any, data_dragon: DataDragon, data_context: DataContext):
  ctx.invoke(
    purge
  )
  data_context.data_path.mkdir()
  run_args=[
    'mongodump',
    '-o', str(data_context.data_path),
    '-d', data_dragon.environment['databases']['default']['database'],
  ]
  return_code = process.call_process(run_args=run_args)
  assert return_code == 0

@data.command()
@click.pass_obj
@pass_data_dragon
def restore(data_dragon: DataDragon, data_context: DataContext):
  database_name = data_dragon.environment['databases']['default']['database']
  if not data_dragon.user.present_confirmation(f'Drop the {database_name} database and replace it with dumped data at\n{data_context.data_path}', default_response=data_dragon.use_the_force):
    return
  drop_run_args = [
    'mongo',
    database_name,
    '--eval',
    'db.dropDatabase()',
  ]
  drop_return_code = process.call_process(run_args=drop_run_args)
  assert drop_return_code == 0
  run_args = [
    'mongorestore',
    '--dir', str(data_context.data_path / database_name),
    '-d', database_name,
    '--nsInclude', f'{database_name}.*',
  ]
  return_code = process.call_process(run_args=run_args)
  assert return_code == 0

@data.command()
@click.option('-i', '--include', 'include_collections', multiple=True)
@click.option('-e', '--exclude', 'exclude_collections', multiple=True)
@click.argument('remote_url')
@click.pass_obj
@click.pass_context
def pull(ctx: any, data_context: DataContext, remote_url: str, include_collections: Tuple[str], exclude_collections: Tuple[str]):
  temp_dir_path = Path(__file__).parent.parent / 'output' / 'temp'
  data_url = ResourceLocator.merge_urls(
    base_url=remote_url,
    url=ResourceLocator.append_locator_parameters(
      url=f'/output/data/datadragon{data_context.suffix}/',
      parameters={
        'dir': str(temp_dir_path),
        'verbose': '1',
      }
    )
  )
  data_locator = locator_factory(url=data_url)
  if include_collections or exclude_collections:
    data_paths = data_locator.list()
    filtered_data_paths = []
    for path_name in data_paths:
      if path_name.endswith('/'):
        continue
      path = Path(path_name)
      collection_name = path.name[:-len(''.join(path.suffixes))]
      if collection_name in exclude_collections:
        continue
      if include_collections and collection_name not in include_collections:
        continue
      filtered_data_paths.append(str(path))
    path_locators = {
      p: locator_factory(url=ResourceLocator.merge_urls(
        base_url=data_url,
        url=f'/{p}'
      ))
      for p in filtered_data_paths
    }
    pulled_paths = {
      p: l.get()
      for p, l in path_locators.items()
    }
    ctx.invoke(
      purge
    )
    for path, pulled_path in pulled_paths.items():
      destination_path = data_context.data_path / path
      os.makedirs(str(destination_path.parent), mode=0o755, exist_ok=True)
      shutil.move(pulled_path, str(destination_path))
      Path(pulled_path).parent.rmdir()
  else:
    temp_data_path = Path(data_locator.get())
    ctx.invoke(
      purge
    )
    shutil.move(str(temp_data_path), str(data_context.data_path))
    shutil.rmtree(str(temp_data_path.parent))

@data.command()
@click.pass_obj
def purge(data_context: DataContext):
  if data_context.data_path.exists():
    shutil.rmtree(str(data_context.data_path))

@data.command()
@click.argument('remote_url')
@click.pass_obj
def push(data_context: DataContext, remote_url: str):
  data_url = ResourceLocator.merge_urls(
    base_url=remote_url,
    url=f'/output/data/datadragon{data_context.suffix}/?locator=1&verbose=1',
  )
  data_locator = locator_factory(url=data_url)
  data_locator.put(resource=os.path.join(str(data_context.data_path), ''))

@data.command()
@click.option('--from', 'from_version', default=DataDragon.previous_version)
@click.option('--to', 'to_version', default=DataDragon.current_version)
@click.pass_obj
@pass_data_dragon
def migrate(data_dragon: DataDragon, data_context: DataContext, from_version: str, to_version: str):
  script_name = f'{from_version}__to__{to_version}'
  query_path = Path(__file__).parent.parent / 'migrate' / 'queries' / f'{script_name}.json'
  script_path = Path(__file__).parent.parent / 'migrate' / 'scripts' / f'{script_name}.py'
  javascript_path = Path(__file__).parent.parent / 'migrate' / 'scripts' / f'{script_name}.js'
  assert query_path.exists() or script_path.exists() or javascript_path.exists()

  queries = []
  if query_path.exists():
    query_url = f'{query_path}?locator=1&encoding=utf-8'
    query_locator = locator_factory(url=query_url)
    query_text = query_locator.get()
    queries.append(SQL.Query(query=query_text))

  layer = SQL.Layer()
  layer.connect()

  def run_query(query: SQL.Query, confirmation: Optional[str]='Run this migration query?') -> Optional[any]:
    log.log(query.substituted_query)
    if confirmation is not None and not data_dragon.user.present_confirmation(
      confirmation.format(query=query),
      default_response=True
    ):
      return None
    return query.run(sql_layer=layer)

  if script_path.exists():
    data_dragon.user.locals = {
      **data_dragon.user.python_locals,
      'log': log,
      'user': data_dragon.user,
      'SQL': SQL,
      'layer': layer,
      'queries': queries,
      'run_query': run_query,
      'db': layer.get_database(),
    }
    data_dragon.user.script_directory_components = [
      'migrate',
      'scripts',
    ]
    data_dragon.user.run_script(script_name=script_name)
  
  if javascript_path.exists():
    if data_dragon.user.present_confirmation(
      f'{javascript_path.read_text()}\n\nRun this script from {javascript_path}',
      default_response=True
    ):
      process.call_process(run_args=[
        'node',
        str(javascript_path),
      ])

  for index, query in enumerate(queries):
    run_query(
      query=query,
      confirmation=f'Run migration query {index + 1} of {len(queries)}?'
    )

  layer.commit()
  layer.disconnect()

@run.group(name='configure')
@click.pass_context
@invoke_subcommand(context_aware=False)
def configure():
  pass

@configure.command()
@click.argument('path')
@click.pass_obj
def get(data_dragon: DataDragon, path: str):
  value = data_dragon.configuration
  for component in path.split('.'):
    if component:
      if isinstance(value, dict):
        value = value[component]
      elif isinstance(value, list):
        value = value[int(component)]
      else:
        raise TypeError(f'Unsupported collection type {type(value)}')
  print(json.dumps(value))
  return value

class VerifyContext:
  verify_options: Dict[str, any]

  def __init__(self, verify_options: Dict[str, any]):
    self.verify_options = verify_options

@run.group(name='verify')
@click.option('-df', '--diff-tool', 'diff_tool')
@click.pass_obj
@click.pass_context
@invoke_subcommand()
def verify(ctx: any, data_dragon: DataDragon, diff_tool: Optional[str]):
  options = {
    'interactive': not data_dragon.use_the_force,
  }
  if diff_tool:
    options['diff_tool'] = diff_tool
  ctx.obj = VerifyContext(verify_options=options)

@verify.command()
@click.option('--from', 'from_version', default='0.1')
@click.option('--to', 'to_version', default='0.2')
@click.pass_obj
@click.pass_context
def migration(ctx: any, verify_context: VerifyContext, from_version: str, to_version: str):
  root_path = Path(__file__).parent.parent
  if from_version == '0.0' and to_version == '0.1':
    ctx.invoke(
      run_fabrica,
      _moda_subcommand=run_fabrica.commands['verify'],
      _moda_subcommand_parameters={
        **verify_context.verify_options,
        'database_a': 'stage',
        'database_b': 'prod',
        'script_path': click.Path()(str(root_path / 'input' / 'verify' / f'verify_{from_version}__to__{to_version}_rules.py')),
        'path_a': str(root_path / 'input' / 'verify' / f'verify_{from_version}__to__{to_version}_rules.json'),
        'path_b': str(root_path / 'input' / 'verify' / f'verify_{from_version}__to__{to_version}_rules.json')
      }
    )
  elif from_version == '0.1' and to_version == '0.2':
    ctx.invoke(
      run_fabrica,
      _moda_subcommand=run_fabrica.commands['verify'],
      _moda_subcommand_parameters={
        **verify_context.verify_options,
        'database_a': 'stage',
        'database_b': 'prod',
        'script_path': click.Path()(str(root_path / 'input' / 'verify' / f'verify_dry_run_rules.py')),
        'path_a': str(root_path / 'input' / 'verify' / f'verify_rules.json'),
        'path_b': str(root_path / 'input' / 'verify' / f'verify_rules.json')
      }
    )
    ctx.invoke(
      run_fabrica,
      _moda_subcommand=run_fabrica.commands['verify'],
      _moda_subcommand_parameters={
        **verify_context.verify_options,
        'database_a': 'stage',
        'database_b': 'prod',
        'escape_a': False,
        'escape_b': False,
        'exclude_columns_a': ('userID',),
        'script_path': click.Path()(str(root_path / 'input' / 'verify' / f'verify_0.1__to__0.2_history.py')),
        'path_a': str(root_path / 'input' / 'verify' / f'verify_all_history.json'),
        'path_b': str(root_path / 'input' / 'verify' / f'verify_all_history.json')
      }
    )
  elif from_version == '0.2' and to_version == '0.3':
    ctx.invoke(
      run_fabrica,
      _moda_subcommand=run_fabrica.commands['verify'],
      _moda_subcommand_parameters={
        **verify_context.verify_options,
        'database_a': 'stage',
        'database_b': 'prod',
        'exclude_columns_a': ('modified',),
        'script_path': click.Path()(str(root_path / 'input' / 'verify' / f'verify_dry_run_rules.py')),
        'path_a': str(root_path / 'input' / 'verify' / f'verify_rules.json'),
        'path_b': str(root_path / 'input' / 'verify' / f'verify_rules.json')
      }
    )
    ctx.invoke(
      run_fabrica,
      _moda_subcommand=run_fabrica.commands['verify'],
      _moda_subcommand_parameters={
        **verify_context.verify_options,
        'database_a': 'stage',
        'database_b': 'prod',
        'escape_a': False,
        'escape_b': False,
        'path_a': str(root_path / 'input' / 'verify' / f'verify_all_history.json'),
        'path_b': str(root_path / 'input' / 'verify' / f'verify_all_history.json')
      }
    )
  else:
    raise ValueError('Unsupported migration versions', (from_version, to_version))

@verify.command()
@click.option('-r', '--rule-id', 'rule_id')
@click.pass_obj
@click.pass_context
def dry_run_activity(ctx: any, verify_context: VerifyContext, rule_id: Optional[str]):
  root_path = Path(__file__).parent.parent
  ctx.invoke(
    run_fabrica,
    _moda_subcommand=run_fabrica.commands['verify'],
    _moda_subcommand_parameters={
      **verify_context.verify_options,
      'database_a': 'stage',
      'database_b': 'prod',
      'escape_a': False,
      'escape_b': False,
      'script_path': str(root_path / 'input' / 'verify' / f'verify_history.py'),
      'format_names': ('rule_id',) if rule_id is not None else tuple(),
      'format_values': (rule_id,) if rule_id is not None else tuple(),
      'path_a': str(root_path / 'input' / 'verify' / f'verify_dry_run_history.json'),
      'path_b': str(root_path / 'input' / 'verify' / f'verify_history.json'),
    }
  )

@verify.command()
@click.option('-h', '--hours', 'hours', type=float, default=24)
@click.pass_obj
@click.pass_context
def prod_errors(ctx: any, verify_context: VerifyContext, hours: float):
  root_path = Path(__file__).parent.parent
  start_date = datetime.utcnow() - timedelta(hours=hours)
  ctx.invoke(
    run_fabrica,
    _moda_subcommand=run_fabrica.commands['verify'],
    _moda_subcommand_parameters={
      **verify_context.verify_options,
      'database': 'prod',
      'escape_a': False,
      'csv_b': True,
      'exclude_columns_b': ('empty',),
      'format_names': ('start_date',),
      'format_values': (start_date,),
      'path_a': str(root_path / 'input' / 'verify' / f'verify_errors.json'),
      'path_b': str(root_path / 'input' / 'verify' / f'verify_empty.csv'),
    }
  )

@verify.command()
@click.option('-h', '--hours', 'hours', type=float, default=24)
@click.pass_obj
@click.pass_context
def stage_errors(ctx: any, verify_context: VerifyContext, hours: float):
  root_path = Path(__file__).parent.parent
  start_date = datetime.utcnow() - timedelta(hours=hours)
  ctx.invoke(
    run_fabrica,
    _moda_subcommand=run_fabrica.commands['verify'],
    _moda_subcommand_parameters={
      **verify_context.verify_options,
      'database': 'stage',
      'escape_a': False,
      'csv_b': True,
      'exclude_columns_b': ('empty',),
      'format_names': ('start_date',),
      'format_values': (start_date,),
      'path_a': str(root_path / 'input' / 'verify' / f'verify_errors.json'),
      'path_b': str(root_path / 'input' / 'verify' / f'verify_empty.csv'),
    }
  )

@run.group(name='ux')
@click.pass_context
@invoke_subcommand(context_aware=False)
def ux():
  pass

@ux.command(name='state')
@click.argument('remote_url')
@click.pass_obj
def ux_state(data_dragon: DataDragon, remote_url: str):
  url, _ = ResourceLocator.strip_locator_parameters(url=ResourceLocator.dealias_url(url=remote_url))
  parts = urllib.parse.urlparse(url)
  remote = urllib.parse.urlunparse((*parts[:5], ''))
  branch = parts.fragment
  datadragon_ux_path = Path(__file__).parent.parent / 'angular-datadragon'
  script = f'''
set -e
cd {process.escape_run_arg(datadragon_ux_path)}
git fetch -f {remote} {branch}:_ux_state
git --no-pager log -n 1 _ux_state
'''
  run_args = process.script_command(script=script)
  _, out, error = data_dragon.run_local_process(
    run_args=run_args,
    confirm=False,
    capture_output=True,
    shell=True
  )
  newline = '\n'
  state = f'{out.decode()}{f"{newline}Error output:{newline}{error.decode()}" if error else ""}'
  state_path = Path(__file__).parent.parent / 'output' / 'state' / f'ux_state_{data_dragon.user.safe_file_name(name=remote_url)}_{data_dragon.user.date_file_name()}.txt'
  state_path.write_text(state)
  log.log(f'{state}\nUX state written to {state_path}')

@ux.command(name='deploy')
@click.option('-p', '--pull-branch', 'pull_branch')
@click.argument('remote_url')
@click.pass_obj
def ux_deploy(data_dragon: DataDragon, pull_branch: Optional[str], remote_url: str):
  url, _ = ResourceLocator.strip_locator_parameters(url=ResourceLocator.dealias_url(url=remote_url))
  parts = urllib.parse.urlparse(url)
  remote = urllib.parse.urlunparse((*parts[:5], ''))
  branch = parts.fragment
  datadragon_ux_path = Path(__file__).parent.parent / 'angular-datadragon'
  pull_commands = f'''
git checkout {process.escape_run_arg(pull_branch)}
git pull
git submodule update
''' if pull_branch else ''
  script = f'''
set -e
cd {process.escape_run_arg(datadragon_ux_path)}
{pull_commands}
git push {remote} HEAD:{branch}
git status
'''
  run_args = process.script_command(script=script)
  data_dragon.run_local_process(
    run_args=run_args,
    shell=True
  )

@run.group(name='api')
@click.pass_context
@invoke_subcommand(context_aware=False)
def api():
  pass

@api.command(name='state')
@click.option('-r', '--remote', 'remote_url')
@click.pass_obj
def api_state(data_dragon: DataDragon, remote_url: Optional[str]):
  data_dragon_path = Path(__file__).parent.parent if remote_url is None else Path(data_dragon.remote_data_dragon_path(remote_url=remote_url)).parent
  script = f'''
set -e
cd {process.escape_run_arg(run_arg=data_dragon_path)}
echo '––– Code state'
git remote update
git --no-pager diff
git --no-pager log -n 1
echo '––– Python state'
source python/environment/bin/activate
pip freeze
echo '––– Node state'
cat package-lock.json
echo '––– Status'
git status
'''
  run_args = process.script_command(script=script)
  _, out, error = data_dragon.run_remote_process(
    run_args=run_args,
    remote_url=remote_url or '',
    confirm=False,
    capture_output=True,
    shell=True
  )
  newline = '\n'
  state = f'{out.decode()}{f"{newline}Error output:{newline}{error.decode()}" if error else ""}'
  state_path = Path(__file__).parent.parent / 'output' / 'state' / f'api_state_{data_dragon.user.safe_file_name(name=remote_url if remote_url else "local")}_{data_dragon.user.date_file_name()}.txt'
  state_path.write_text(state)
  log.log(f'{state}\nAPI state written to {state_path}')

@api.command(name='status')
@click.pass_obj
def api_status(data_dragon: DataDragon):
  data_dragon.run_local_process(
    run_args=process.script_command(script=data_dragon.configuration['api_status_command']),
    confirm=False,
    shell=True
  )

@api.command(name='start')
@click.pass_obj
def api_start(data_dragon: DataDragon):
  data_dragon.run_local_process(
    run_args=process.script_command(script=data_dragon.configuration['api_start_command']),
    confirm=False,
    shell=True
  )

@api.command(name='stop')
@click.pass_obj
def api_stop(data_dragon: DataDragon):
  data_dragon.run_local_process(
    run_args=process.script_command(script=data_dragon.configuration['api_stop_command']),
    confirm=False,
    shell=True
  )

@api.command(name='pull')
@click.argument('pull_branch')
@click.option('-r', '--remote', 'remote_url')
@click.pass_obj
def api_pull(data_dragon: DataDragon, pull_branch: str, remote_url: Optional[str]):
  data_dragon_path = Path(__file__).parent.parent if remote_url is None else Path(data_dragon.remote_data_dragon_path(remote_url=remote_url)).parent
  script = f'''
set -e
cd {process.escape_run_arg(run_arg=data_dragon_path)}
git remote update
git checkout {process.escape_run_arg(run_arg=pull_branch)}
git pull
git submodule update
git status
'''
  run_args = process.script_command(script=script)
  data_dragon.run_remote_process(
    run_args=run_args,
    remote_url=remote_url or '',
    confirm=False,
    shell=True
  )

@api.command(name='install')
@click.option('-r', '--remote', 'remote_url')
@click.pass_obj
def api_install(data_dragon: DataDragon, remote_url: Optional[str]):
  data_dragon_path = Path(__file__).parent.parent if remote_url is None else Path(data_dragon.remote_data_dragon_path(remote_url=remote_url)).parent
  script = f'''
set -e
cd {process.escape_run_arg(run_arg=data_dragon_path)}
./install.sh
'''
  run_args = process.script_command(script=script)
  data_dragon.run_remote_process(
    run_args=run_args,
    remote_url=remote_url or '',
    confirm=False,
    shell=True
  )
  
@api.command(name='deploy')
@click.option('-t/-T', '--terminate/--no-terminate', 'should_stop', is_flag=True)
@click.option('-s/-S', '--start/--no-start', 'should_start', is_flag=True)
@click.option('-b/-B', '--backup/--no-backup', 'should_dump', is_flag=True)
@click.option('-m/-M', '--migrate/--no-migrate', 'should_migrate', is_flag=True)
@click.option('-i/-I', '--install/--no-install', 'should_install', is_flag=True)
@click.option('-p', '--pull-branch', 'pull_branch')
@click.option('-r', '--remote-url', 'remote_url')
@click.pass_obj
@click.pass_context
def api_deploy(ctx: any, data_dragon: DataDragon, should_stop: bool, should_start: bool, should_dump: bool, should_migrate: bool, should_install: bool, pull_branch: Optional[str], remote_url: Optional[str]):
  if should_stop:
    log.log(f'––> Stopping API')
    if remote_url is not None:
      ctx.invoke(
        remote,
        _confirm=False,
        remote_url=remote_url,
        remote_command=('api', 'stop')
      )
    else:
      ctx.invoke(
        api_stop
      )
  if pull_branch:
    log.log(f'––> Pulling branch {pull_branch}')
    ctx.invoke(
      api_pull,
      pull_branch=pull_branch,
      remote_url=remote_url
    )
  if should_install:
    log.log('––> Installing')
    ctx.invoke(
      api_install,
      remote_url=remote_url
    )

  if remote_url or pull_branch or should_install:
    remaining_options = []
    if should_dump:
      remaining_options.append('-b')
    if should_migrate:
      remaining_options.append('-m')
    if should_start:
      remaining_options.append('-s')
    if remaining_options:
      ctx.invoke(
        remote,
        _confirm=False,
        remote_url=remote_url or str(Path(__file__).parent.parent),
        remote_command=('api', 'deploy', *remaining_options)
      )
    return

  if should_dump:
    log.log('––> Backing up data')
    ctx.invoke(
      data,
      _moda_subcommand=dump,
    )
    log.log('––> Backing up files')
    ctx.invoke(
      files,
      _moda_subcommand=files_dump,
    )
  if should_migrate:
    log.log('––> Migrating data')
    ctx.invoke(
      data,
      _moda_subcommand=migrate,
    )
    log.log('––> Migrating files')
    ctx.invoke(
      files,
      _moda_subcommand=files_migrate,
    )
  if should_start:
    log.log(f'––> Starting API')
    ctx.invoke(
      api_start
    )

class APIRunContext:
  data_dragon: DataDragon

  def __init__(self, data_dragon: DataDragon):
    self.data_dragon = data_dragon

  def run_api_command(self, command: List[str], command_args: List[str]=[], capture_output: bool=False, check_completed: bool=True, load_output: bool=False) -> Union[Optional[Tuple[int, Optional[bytes], Optional[bytes]]], any]:
    api_run_path = Path(__file__).parent.parent / 'run'
    result = self.data_dragon.run_local_process(
      run_args=[
        str(api_run_path),
        *([':'.join(command)] if command else []),
        *command_args,
      ],
      capture_output=capture_output or load_output,
      check_completed=check_completed,
      confirm=False,
    )
    if load_output:
      assert result[0] == 0, 'Non-zero return code from API command'
      command_output = result[1].rsplit(b'\n', maxsplit=2)[-2]
      output = json.loads(command_output)
    else:
      output = result
    return output

@api.command(name='run')
@click.argument('command', nargs=-1)
@click.pass_obj
def api_run(data_dragon: DataDragon, command: Tuple[str]):
  run_context = APIRunContext(
    data_dragon=data_dragon
  )
  return run_context.run_api_command(
    command=[],
    command_args=list(command)
  )

@api.group(name='test')
@click.pass_context
@invoke_subcommand(context_aware=False)
def api_test():
  pass

@api_test.command(name='rule')
@click.option('-tu', '--test-url', 'test_url')
@click.option('-cu', '--credential-url', 'credential_url')
@click.option('-ru', '--rule-url', 'rule_url')
@click.option('-u', '--user-id', 'user_id')
@click.option('-r', '--rule-id', 'rule_id')
@click.option('-c', '--channel', 'channel')
@click.option('-f', '--from-date', 'from_date')
@click.option('-t', '--to-date', 'to_date')
@click.option('-d', '--granularity', 'granularity', type=click.Choice(['HOURLY', 'DAILY']))
@click.pass_obj
def api_test_rule(data_dragon: DataDragon, test_url: Optional[str], credential_url: Optional[str], rule_url: Optional[str], user_id: Optional[str], rule_id: Optional[str], channel: Optional[str], from_date: Optional[str], to_date: Optional[str], granularity: Optional[str]):
  assert channel is not None or test_url is not None or rule_url is not None or rule_id is not None, 'One of --channel --test-url, --rule-url, or --rule-id is required'
  data_dragon.configure_encryption()
  if test_url is None and channel is not None:
    test_path = Path(__file__).parent.parent / 'input' / 'test' / 'rule' / f'test_{channel}.json'
    test_url = str(test_path) if test_path.exists() else None
  test_configuration = locator_factory(url=test_url).get().decode() if test_url is not None else {}
  test = io_pruned_structure({
    **json.loads(test_configuration),
    **({'credential_url': credential_url} if credential_url is not None else {}),
    **({'rule_id': rule_id} if rule_id is not None else {}),
    **({'user_id': user_id} if user_id is not None else {}),
    **({'rule_url': rule_url} if rule_url is not None else {}),
    **({'channel': channel} if channel is not None else {}),
    **({'from_date': from_date} if from_date is not None else {}),
    **({'to_date': to_date} if to_date is not None else {}),
    **({'granularity': granularity} if granularity is not None else {}),
  })
  test_format = Format().bold().cyan()
  data_dragon.user.present_message(test_format(f'††† Running test configuration\n{json.dumps(test, indent=2)}'))
  if 'channel' in test:
    if 'credential_url' not in test:
      test['credential_url'] = f'alias://credentials/test/test_{test["channel"]}.{"zip" if test["channel"] == "apple_search_ads" else "json"}'
    if 'rule_url' not in test and 'rule_id' not in test:
      test['rule_url'] = str(Path(__file__).parent.parent / 'input' / 'test' / 'rule' / f'test_{test["channel"]}_rule.json')
  run_context = APIRunContext(data_dragon=data_dragon)
  password = data_dragon.generate_password()
  if 'user_id' not in test:
    user = run_context.run_api_command(
      command=['user', 'create'],
      command_args=[
        '-q',
        '-t',
        '-w', password,
        '{"local":{"email":"test@example.com"},"name":"TestUser"}',
      ],
      load_output=True
    )
    data_dragon.user.present_message(test_format(f'††† Created test user {user["_id"]}'))
  else:
    user = {'_id': test['user_id']}

  if 'credential_url' in test:
    if channel == 'apple_search_ads':
      credential_json = '{"name":"AppleTestCredential","target":"apple_search_ads"}'
      certificate_locator = locator_factory(url=test['credential_url'])
      certificate_locator.safe = False
      certificate_contents = certificate_locator.get()
      certificate_fd, certificate_file_path = tempfile.mkstemp(prefix=str(Path(__file__).parent.parent / 'output' / 'temp' / 'test_'))
      try:
        os.write(certificate_fd, certificate_contents)
        os.close(certificate_fd)
        credential = run_context.run_api_command(
          command=['credential', 'create'],
          command_args=[
            '-q',
            '-t',
            '-u', user['_id'],
            '-c', certificate_file_path,
            credential_json,
          ],
          load_output=True
        )
      finally:
        Path(certificate_file_path).unlink()
    else:
      credential_json = locator_factory(url=test['credential_url']).get().decode()
      credential = run_context.run_api_command(
        command=['credential', 'create'],
        command_args=[
          '-q',
          '-t',
          '-u', user['_id'],
          credential_json,
        ],
        load_output=True
      )
    data_dragon.user.present_message(test_format(f'††† Created test credential {credential["_id"]}'))
  else:
    credential = None
    
  if 'rule_url' in test and 'rule_id' not in test:
    rule_locator = locator_factory(url=test['rule_url'])
    rule_json = rule_locator.get().decode()
    rule = run_context.run_api_command(
      command=['rule', 'create'],
      command_args=[
        '-q',
        '-t',
        *([
          '-u', user['_id'],
          '-c', credential['path'],
        ] if credential is not None else []),
        rule_json,
      ],
      load_output=True
    )
    data_dragon.user.present_message(test_format(f'††† Created {channel} test rule {rule["_id"]}'))
  elif 'rule_id' in test:
    rule = {'_id': test['rule_id']}
  else:
    rule = {}

  data_dragon.user.present_message(test_format(f'††† Performing live run of {channel} test rule {rule["_id"]}'))
  run_overrides = [
    *(['-g', test['granularity']] if 'granularity' in test else []),
    *(['-f', test['from_date']] if 'from_date' in test else []),
    *(['-t', test['to_date']] if 'to_date' in test else []),
  ]
  run_context.run_api_command(
    command=['rule', 'run'],
    command_args=[
      *run_overrides,
      '--allow-non-dry-run',
      rule['_id'],
    ],
  )

  data_dragon.user.present_message(test_format(f'††† Retrieving live actions from {channel} test rule {rule["_id"]}'))
  history = run_context.run_api_command(
    command=['rule', 'show-history'],
    command_args=[
      '-q',
      rule['_id'],
    ],
    load_output=True
  )
  actions = list(filter(lambda h: h['historyType'] == 'action', history))
  assert actions, 'No actions in test rule history'
  def check_apple_search_ads_actions(actions: List[Dict[str, any]]):
    for action in actions:
      match = re.search(r'from ([^ ]+) to ([^ ]+)', action['actionDescription'])
      action['adjustmentFrom'] = float(match.group(1))
      action['adjustmentTo'] = float(match.group(2))
      assert action['adjustmentFrom'] != action['adjustmentTo'], f'No adjustment made for action {action}'
  if channel == 'apple_search_ads':
    check_apple_search_ads_actions(actions)
  data_dragon.user.present_message(test_format(f'††† Clearing live actions for {channel} test rule {rule["_id"]}'))
  run_context.run_api_command(
    command=['rule', 'clear-history'],
    command_args=[
      rule['_id'],
    ],
  )

  data_dragon.user.present_message(test_format(f'††† Performing dry run of {channel} test rule {rule["_id"]}'))
  run_context.run_api_command(
    command=['rule', 'run'],
    command_args=[
      '-g', 'DAILY',
      '-f', '2020-05-01',
      '-t', '2020-05-07',
      rule['_id'],
    ],
  )

  data_dragon.user.present_message(test_format(f'††† Retrieving dry run actions from {channel} test rule {rule["_id"]}'))
  dry_run_history = run_context.run_api_command(
    command=['rule', 'show-history'],
    command_args=[
      '-q',
      rule['_id'],
    ],
    load_output=True
  )
  dry_run_actions = list(filter(lambda h: h['historyType'] == 'action', dry_run_history))
  if channel == 'apple_search_ads':
    check_apple_search_ads_actions(dry_run_actions)
  def check_live_and_dry_actions(actions: List[Dict[str, any]], dry_run_actions: List[Dict[str, any]]):
    def check_adjustment_difference(actual: any, expected: any):
      if type(actual) is float and type(expected) is float:
        return actual == expected or (abs(expected - actual) < 0.001 and abs((expected - actual) / expected)) < 0.001
      return actual == expected
    assert len(actions) == len(dry_run_actions), f'{len(actions)} action count does not match {len(dry_run_actions)} dry run action count'
    for action in actions:
      dry_actions = list(filter(lambda a: a['targetType'] == action['targetType'] and a['targetID'] == action['targetID'], dry_run_actions))
      assert dry_actions, f'No matching dry run action found for target {action["targetType"]} {action["targetID"]}'
      assert check_adjustment_difference(dry_actions[0]['adjustmentFrom'], action['adjustmentTo']), f'Dry run found {action["targetType"]} {action["targetID"]} in state {dry_actions[0]["adjustmentFrom"]}, which does not match live adjusment to state {action["adjustmentTo"]}'
  check_live_and_dry_actions(actions, dry_run_actions)

  adjustment_output = '\n'.join(f'{a["targetType"]} {a["targetID"]} {a["adjustmentType"]} from {a["adjustmentFrom"]} to {a["adjustmentTo"]}' for a in actions)
  data_dragon.user.present_message(test_format(f'††† Finished test with {channel} test rule {rule["_id"]}\nConfiguration:\n{json.dumps(test, indent=2)}\nAdjustments:\n{adjustment_output}'))

@run.command()
@click.option('-t/-T', '--terminate/--no-terminate', 'should_stop', is_flag=True, default=True)
@click.option('-m/-M', '--migrate/--no-migrate', 'should_migrate', is_flag=True)
@click.option('-i/-I', '--install/--no-install', 'should_install', is_flag=True)
@click.option('-r/-R', '--restart/--no-restart', 'should_start', is_flag=True)
@click.option('--force-dry-rule-runs/--no-force-dry-rule-runs', 'force_dry_rule_runs', is_flag=True, default=True)
@click.option('-p', '--pull-branch', 'pull_branch')
@click.option('-u', '--ux-deployment-url', 'ux_deployment_url')
@click.option('-s', '--suffix', 'suffix', default='sync')
@click.option('-ic', '--include-collections', 'include_collections', multiple=True)
@click.option('-ec', '--exclude-collections', 'exclude_collections', multiple=True)
@click.option('-cs', '--check-status', 'should_check_status', is_flag=True)
@click.argument('source_url')
@click.argument('destination_url')
@pass_data_dragon
@click.pass_context
def sync(ctx: any, data_dragon: DataDragon, should_stop: bool, should_migrate: bool, should_install: bool, should_start: bool, force_dry_rule_runs: bool, pull_branch: Optional[str], ux_deployment_url: Optional[str], suffix: str, include_collections: Tuple[str], exclude_collections: Tuple[str], should_check_status:bool, source_url: str, destination_url: str):
  if should_stop:
    log.log(f'––> Stopping DataDragon API on {destination_url}')
    ctx.invoke(
      remote,
      remote_url=destination_url,
      remote_command=('api', 'stop')
    )
  if ux_deployment_url:
    ctx.invoke(
      ux,
      _moda_subcommand=ux_deploy,
      _moda_subcommand_parameters={
        'remote_url': ux_deployment_url,
      }
    )
    
  if pull_branch:
    log.log(f'––> Pulling branch {pull_branch} DataDragon API on {destination_url}')
    ctx.invoke(
      api,
      _moda_subcommand=api_pull,
      _moda_subcommand_parameters={
        'pull_branch': pull_branch,
        'remote_url': destination_url,
      },
    )
  
  if should_install:
    log.log(f'––> Installing DataDragon API dependencies on {destination_url}')
    ctx.invoke(
      api,
      _moda_subcommand=api_install,
      _moda_subcommand_parameters={
        'remote_url': destination_url,
      },
    )

  log.log(f'––> Dumping data on {source_url}')
  ctx.invoke(
    remote,
    remote_url=source_url,
    remote_command=('data', '-s', suffix, 'dump')
  )

  log.log(f'––> Dumping files on {source_url}')
  ctx.invoke(
    remote,
    remote_url=source_url,
    remote_command=('files', '-s', suffix, 'dump')
  )

  if not data_dragon.remote_url_is_this_instance(remote_url=source_url):
    log.log(f'––> Pulling data from {source_url}')
    ctx.invoke(
      data,
      suffix=suffix,
      _moda_subcommand=pull,
      _moda_subcommand_parameters={
        'remote_url': source_url,
        'include_collections': include_collections,
        'exclude_collections': exclude_collections,
      }
    )

    log.log(f'––> Pulling files from {source_url}')
    ctx.invoke(
      files,
      suffix=suffix,
      _moda_subcommand=files_pull,
      _moda_subcommand_parameters={
        'remote_url': source_url,
      }
    )

  if not data_dragon.remote_url_is_this_instance(remote_url=destination_url):
    log.log(f'––> Purging {suffix} data on {destination_url}')
    ctx.invoke(
      remote,
      remote_url=destination_url,
      remote_command=('data', '-s', suffix, 'purge')
    )

    log.log(f'––> Purging {suffix} files on {destination_url}')
    ctx.invoke(
      remote,
      remote_url=destination_url,
      remote_command=('files', '-s', suffix, 'purge')
    )

    log.log(f'––> Pushing data to {destination_url}')
    ctx.invoke(
      data,
      suffix=suffix,
      _moda_subcommand=push,
      _moda_subcommand_parameters={
        'remote_url': destination_url,
      }
    )

    log.log(f'––> Pushing files to {destination_url}')
    ctx.invoke(
      files,
      suffix=suffix,
      _moda_subcommand=files_push,
      _moda_subcommand_parameters={
        'remote_url': destination_url,
      }
    )

  if should_check_status:
    log.log(f'––> Checking DataDragon API status on {destination_url}')
    ctx.invoke(
      remote,
      remote_url=destination_url,
      remote_command=('api', 'status')
    )

  log.log(f'––> Restoring data on {destination_url}')
  ctx.invoke(
    remote,
    remote_url=destination_url,
    remote_command=('data', '-s', suffix, 'restore')
  )

  if should_migrate:
    log.log(f'––> Migrating data on {destination_url}')
    ctx.invoke(
      remote,
      remote_url=destination_url,
      remote_command=('data', 'migrate')
    )

  if force_dry_rule_runs:
    log.log(f'––> Migrating rules to dry run on {destination_url}')
    ctx.invoke(
      remote,
      remote_url=destination_url,
      remote_command=('data', 'migrate', '--from', 'any', '--to', 'dry_run_only')
    )

  log.log(f'––> Restoring files on {destination_url}')
  ctx.invoke(
    remote,
    remote_url=destination_url,
    remote_command=('files', '-s', suffix, 'restore')
  )

  if should_migrate:
    log.log(f'––> Migrating files on {destination_url}')
    ctx.invoke(
      remote,
      remote_url=destination_url,
      remote_command=('files', 'migrate')
    )

  if force_dry_rule_runs:
    log.log(f'––> Verifying dry run status on {destination_url}')
    _, output, _ = ctx.invoke(
      remote,
      remote_url=destination_url,
      remote_command=('configure', 'get', 'dry_run_only'),
      _confirm=False,
      _capture_output=True
    )
    assert output.decode() == 'true\n'

  if should_migrate:
    log.log('––> Verifying migration')
    try:
      ctx.invoke(
        verify,
        _moda_subcommand=migration,
      )
    except click.ClickException:
      pass

  if should_start:
    log.log(f'––> Starting DataDragon API status on {destination_url}')
    ctx.invoke(
      remote,
      remote_url=destination_url,
      remote_command=('api', 'start')
    )

@run.command()
@click.option('-m/-M', '--migrate/--no-migrate', 'should_migrate', is_flag=True)
@click.option('-i/-I', '--install/--no-install', 'should_install', is_flag=True)
@click.option('-p/-P', '--pull/--no-pull', 'should_pull', is_flag=True)
@click.option('-u/-U', '--deploy-ux/--no-deploy-ux', 'should_deploy_ux', is_flag=True)
@click.option('-r/-R', '--restart/--no-restart', 'should_start', is_flag=True, default=True)
@pass_data_dragon
@click.pass_context
def sync_stage_with_prod(ctx: any, data_dragon: DataDragon, should_migrate: bool, should_install: bool, should_pull: bool, should_deploy_ux: bool, should_start: bool):
  ctx.invoke(
    sync,
    should_migrate=should_migrate,
    should_install=should_install,
    should_start=should_start,
    force_dry_rule_runs=True,
    pull_branch='staging' if should_pull else None,
    ux_deployment_url='alias://ux_stage' if should_deploy_ux else None,
    suffix='prod',
    source_url='alias://prod',
    destination_url='alias://stage'
  )

@run.command()
@click.argument('script', type=click.Path(file_okay=True, dir_okay=False, readable=True, exists=True))
@click.argument('script_args', nargs=-1)
@click.pass_obj
def script(data_dragon: DataDragon, script: str, script_args: Tuple[str]):
  user = data_dragon.user
  api_run_context = APIRunContext(data_dragon=data_dragon)
  user.locals = {
    **user.python_locals,
    'user': user,
    'api': api_run_context,
    'data_dragon': data_dragon,
    'fabrica': fabrica,
    'SQL': SQL,
    'script_args': script_args,
  }
  user.run_script_path(script_path=script)

run.add_command(run_fabrica, name='fabrica')
