import { Fragment } from 'react'
import { CaretRight } from '@phosphor-icons/react'
import { Link } from '../router'

export interface BreadcrumbItem {
  label: string
  to?: string
}

export function Breadcrumb ({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && <CaretRight className="breadcrumb-sep" size={12} />}
          {item.to ? <Link to={item.to}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
        </Fragment>
      ))}
    </nav>
  )
}
