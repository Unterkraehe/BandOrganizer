import { render, screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { App } from '@/app/App';

export type User = ReturnType<typeof userEvent.setup>;

/** Demo mode: welcome → band setup → first profile → app shell (member "Lisa", band "Overload"). */
export async function enterDemo(user: User, path = '/') {
  render(<App initialPath={path} autoStart={false} />);
  await user.click(screen.getByRole('button', { name: 'Demo ausprobieren' }));
  await user.type(await screen.findByRole('textbox', { name: 'Bandname' }), 'Overload');
  await user.click(screen.getByRole('radio', { name: 'Signalrot' }));
  await user.click(screen.getByRole('button', { name: 'Band einrichten' }));
  await user.type(await screen.findByRole('textbox', { name: 'Name' }), 'Lisa');
  await user.type(screen.getByRole('combobox', { name: /Instrument/ }), 'Gesang');
  await user.click(screen.getByRole('button', { name: "Los geht's" }));
}
