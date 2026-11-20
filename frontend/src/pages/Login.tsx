import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, LoaderCircle } from 'lucide-react'
import { api, client, message } from '../services/api'
import type { AdminUser } from '../../../shared/leads'
import { Button } from '../components/ui/button'
import { Brand } from '../components/Brand'
import './Login.css'

const schema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, 'Enter your email or phone number')
    .refine(
      (v) => z.email().safeParse(v).success || /^\+?\d{7,15}$/.test(v),
      'Enter a valid email or phone number',
    ),
  password: z.string().min(1, 'Enter your password'),
})

type LoginValues = z.infer<typeof schema>

export function Login() {
  const [show, setShow] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (values: LoginValues) => {
    clearErrors('root')
    try {
      const user = await api<AdminUser>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(values),
      })
      client.setQueryData(['session'], user)
    } catch (error) {
      setError('root', { message: message(error) })
    }
  }

  return (
    <div className="login-screen flex min-h-screen items-center justify-center px-4 py-8">
      <div className="login-card w-full max-w-md rounded-2xl border border-slate-100 bg-white p-8 shadow-xl">
        <div className="mb-8 text-center">
          <div className="login-brand">
            <Brand />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
          <p className="mt-2 text-sm text-gray-500">
            Sign in to your account to continue
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="login-form space-y-5" noValidate aria-busy={isSubmitting}>
          <div>
            <label
              htmlFor="identifier"
              className="mb-1.5 block text-sm font-medium text-gray-700"
            >
              Email or Phone
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id="identifier"
                type="text"
                autoComplete="username"
                placeholder="you@example.com or +1234567890"
                aria-invalid={!!errors.identifier}
                aria-describedby={errors.identifier ? 'identifier-error' : undefined}
                {...register('identifier', { onChange: () => clearErrors('root') })}
                className="login-control w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            {errors.identifier && (
              <p id="identifier-error" role="alert" className="mt-1.5 text-sm text-red-600">
                {errors.identifier.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-gray-700"
            >
              Password
            </label>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id="password"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'password-error' : undefined}
                {...register('password', { onChange: () => clearErrors('root') })}
                className="login-control w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
                aria-label={show ? 'Hide password' : 'Show password'}
                aria-pressed={show}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && (
              <p id="password-error" role="alert" className="mt-1.5 text-sm text-red-600">
                {errors.password.message}
              </p>
            )}
          </div>

          {errors.root && (
            <p className="login-error rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
              {errors.root.message}
            </p>
          )}

          <Button
            type="submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            className="login-submit flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Signing in…
              </>
            ) : (
              <>
                Sign in
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}